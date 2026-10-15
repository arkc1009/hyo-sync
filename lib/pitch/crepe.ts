// 브라우저 전용. CREPE tiny (TF.js) 로 10ms hop f0 + confidence
// 프레이밍·정규화·디코딩은 python crepe 와 동일 (spike/README.md "확인된 것" 2번)
import type * as TF from "@tensorflow/tfjs";
import { SAMPLE_RATE } from "./decode";

export const HOP_MS = 10;
const HOP = (SAMPLE_RATE * HOP_MS) / 1000; // 160
const WIN = 1024;
const BATCH = 256;
const MODEL_URL = "/models/crepe-tiny/model.json";
const WASM_DIR = "/tfjs-wasm/";

// 360빈 → cent (10Hz 기준). bin i = 1997.379 + 20*i
const CREPE_CENTS = Float32Array.from({ length: 360 }, (_, i) => 1997.3794084376191 + 20 * i);

let loaded: Promise<{ tf: typeof TF; model: TF.LayersModel }> | null = null;

/** tf.js 와 모델은 한 번만 로드. 백엔드는 webgl → wasm → cpu */
export function loadCrepe() {
  loaded ??= (async () => {
    const tf = await import("@tensorflow/tfjs");
    const wasm = await import("@tensorflow/tfjs-backend-wasm");
    wasm.setWasmPaths(WASM_DIR);
    let ok = false;
    for (const b of ["webgl", "wasm", "cpu"]) {
      try {
        if (await tf.setBackend(b)) { await tf.ready(); ok = true; break; }
      } catch (e) {
        console.warn(`tf backend ${b} 실패`, e);
      }
    }
    if (!ok) throw new Error("사용 가능한 tf 백엔드 없음");
    const model = await tf.loadLayersModel(MODEL_URL);
    tf.tidy(() => model.predict(tf.zeros([1, WIN])) as TF.Tensor); // 워밍업
    return { tf, model };
  })();
  return loaded;
}

export function frameCount(samples: Float32Array) {
  return Math.floor(samples.length / HOP) + 1;
}

/** center=True: 양쪽 512 제로패딩 */
export function padded(samples: Float32Array) {
  const p = new Float32Array(samples.length + WIN);
  p.set(samples, WIN / 2);
  return p;
}

export interface RawPitch {
  hz: Float32Array;
  confidence: Float32Array;
}

export async function runCrepe(samples: Float32Array, onProgress?: (p: number) => void): Promise<RawPitch> {
  const { tf, model } = await loadCrepe();
  const nFrames = frameCount(samples);
  const pad = padded(samples);
  const hz = new Float32Array(nFrames);
  const confidence = new Float32Array(nFrames);

  for (let start = 0; start < nFrames; start += BATCH) {
    const b = Math.min(BATCH, nFrames - start);
    const x = new Float32Array(b * WIN);
    for (let k = 0; k < b; k++) {
      const off = (start + k) * HOP;
      let mean = 0;
      for (let i = 0; i < WIN; i++) mean += pad[off + i];
      mean /= WIN;
      let sq = 0;
      for (let i = 0; i < WIN; i++) {
        const v = pad[off + i] - mean;
        x[k * WIN + i] = v;
        sq += v * v;
      }
      const std = Math.sqrt(sq / WIN);
      if (std > 0) for (let i = 0; i < WIN; i++) x[k * WIN + i] /= std;
    }
    const act = tf.tidy(() => model.predict(tf.tensor2d(x, [b, WIN])) as TF.Tensor);
    const a = await act.data();
    act.dispose();
    for (let k = 0; k < b; k++) {
      const row = a.subarray(k * 360, (k + 1) * 360);
      let c = 0, m = -1;
      for (let i = 0; i < 360; i++) if (row[i] > m) { m = row[i]; c = i; }
      // argmax ±4빈 가중평균 (crepe.to_local_average_cents)
      const lo = Math.max(0, c - 4), hi = Math.min(359, c + 4);
      let ws = 0, ps = 0;
      for (let i = lo; i <= hi; i++) { ws += row[i]; ps += row[i] * CREPE_CENTS[i]; }
      hz[start + k] = 10 * Math.pow(2, ps / ws / 1200);
      confidence[start + k] = m;
    }
    onProgress?.((start + b) / nFrames);
    await new Promise((r) => setTimeout(r, 0)); // UI 양보
  }
  return { hz, confidence };
}

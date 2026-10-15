// 브라우저 전용. 이 시그니처는 추출기를 바꿔도 유지한다 (CLAUDE.md)
import type { PitchTrack } from "@/lib/analysis/types";
import { HOP_MS, frameCount, padded, runCrepe, type RawPitch } from "./crepe";
import { decodeTo16kMono } from "./decode";

/** CREPE confidence 가 이 값 미만이면 무성 */
export const VOICED_MIN = 0.5;
/** 트랙 상위 5% RMS 대비 이 dB 이하 프레임은 무성 (잔류 노이즈 제거. 리버브 꼬리는 못 거름 — SPEC 가정 3) */
export const GATE_DB = -30;

const WIN = 1024;
const hzToMidiCents = (hz: number) => 1200 * Math.log2(hz / 440) + 6900;

export interface ExtractResult {
  track: PitchTrack;
  durationMs: number;
}

export interface ExtractProgress {
  /** 'decode' | 'model' | 'pitch' */
  stage: "decode" | "model" | "pitch";
  /** 0~1, pitch 단계에서만 의미 있음 */
  value: number;
}

export async function extractPitch(
  file: Blob,
  onProgress?: (p: ExtractProgress) => void,
): Promise<ExtractResult> {
  onProgress?.({ stage: "decode", value: 0 });
  const { samples, durationMs } = await decodeTo16kMono(file);
  onProgress?.({ stage: "model", value: 0 });
  const raw = await runCrepe(samples, (v) => onProgress?.({ stage: "pitch", value: v }));
  const loud = energyGate(frameRmsDb(samples), GATE_DB);
  return { track: toPitchTrack(raw, VOICED_MIN, loud), durationMs };
}

function frameRmsDb(samples: Float32Array) {
  const n = frameCount(samples);
  const pad = padded(samples);
  const hop = (16000 * HOP_MS) / 1000;
  const db = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sq = 0;
    const off = f * hop;
    for (let i = 0; i < WIN; i++) sq += pad[off + i] * pad[off + i];
    db[f] = 10 * Math.log10(sq / WIN + 1e-12);
  }
  return db;
}

function energyGate(rmsDb: Float32Array, gateDb: number) {
  const sorted = Float32Array.from(rmsDb).sort();
  const ref = sorted[Math.floor(sorted.length * 0.95)];
  return Array.from(rmsDb, (d) => d >= ref + gateDb);
}

function toPitchTrack({ hz, confidence }: RawPitch, thr: number, loud: boolean[]): PitchTrack {
  const n = hz.length;
  const f0Cents: (number | null)[] = new Array(n);
  const conf: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    conf[i] = Math.round(confidence[i] * 1000) / 1000;
    const ok = confidence[i] >= thr && loud[i] && hz[i] > 0 && Number.isFinite(hz[i]);
    f0Cents[i] = ok ? Math.round(hzToMidiCents(hz[i]) * 10) / 10 : null;
  }
  return { hopMs: HOP_MS, frames: n, f0Cents, confidence: conf };
}

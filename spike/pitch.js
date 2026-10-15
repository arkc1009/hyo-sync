/* Phase 0 스파이크: 브라우저에서 CREPE tiny(TF.js)와 pitchy(McLeod)로 f0 추출해 비교한다.
 * 앱 코드가 아니다. 여기서 확인된 내용을 /lib/pitch 로 옮긴다. */

const SR = 16000;
const HOP_MS = 10;
const HOP = (SR * HOP_MS) / 1000; // 160
const WIN = 1024;
const BATCH = 256;

// CREPE 출력 360빈 → cent (10Hz 기준). bin i = 1997.379 + 20*i
const CREPE_CENTS = Float32Array.from({ length: 360 }, (_, i) => 1997.3794084376191 + 20 * i);

const hzToMidiCents = (hz) => 1200 * Math.log2(hz / 440) + 6900;

const $ = (id) => document.getElementById(id);
const status = (s) => { $('status').textContent = s; };

let model = null;

/** ?backend=webgl|wasm|cpu 로 강제. 기본은 webgl → wasm → cpu 순으로 시도 */
async function pickBackend() {
  const want = new URLSearchParams(location.search).get('backend');
  if (typeof tf.wasm?.setWasmPaths === 'function') tf.wasm.setWasmPaths('vendor/');
  const order = want ? [want] : ['webgl', 'wasm', 'cpu'];
  for (const b of order) {
    try {
      if (await tf.setBackend(b)) { await tf.ready(); return tf.getBackend(); }
    } catch (e) { console.warn(`backend ${b} 실패`, e); }
  }
  throw new Error('사용 가능한 tf 백엔드 없음');
}

async function loadModel() {
  await pickBackend();
  const t0 = performance.now();
  model = await tf.loadLayersModel('model/model.json');
  // 워밍업 (셰이더 컴파일)
  tf.tidy(() => model.predict(tf.zeros([1, WIN])));
  status(`모델 로딩 완료 (${tf.getBackend()}, ${(performance.now() - t0).toFixed(0)}ms). 파일을 고르세요.`);
}

/** File → 16kHz 모노 Float32Array. decodeAudioData가 컨텍스트 sampleRate로 리샘플해 준다. */
async function decodeTo16kMono(file) {
  const ab = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, SR);
  const buf = await ctx.decodeAudioData(ab);
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  if (buf.numberOfChannels > 1) for (let i = 0; i < n; i++) out[i] /= buf.numberOfChannels;
  return out;
}

/** center=True 프레이밍: 양쪽 512 제로패딩 후 hop마다 1024 윈도우 */
function frameCount(samples) {
  return Math.floor(samples.length / HOP) + 1;
}
function padded(samples) {
  const p = new Float32Array(samples.length + WIN);
  p.set(samples, WIN / 2);
  return p;
}

async function runCrepe(samples, onProgress) {
  const nFrames = frameCount(samples);
  const pad = padded(samples);
  const hz = new Float32Array(nFrames);
  const conf = new Float32Array(nFrames);

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
    const act = tf.tidy(() => model.predict(tf.tensor2d(x, [b, WIN])));
    const a = await act.data();
    act.dispose();
    for (let k = 0; k < b; k++) {
      const row = a.subarray(k * 360, (k + 1) * 360);
      let c = 0, m = -1;
      for (let i = 0; i < 360; i++) if (row[i] > m) { m = row[i]; c = i; }
      // crepe.to_local_average_cents: argmax ±4빈 가중평균
      const lo = Math.max(0, c - 4), hi = Math.min(359, c + 4);
      let ws = 0, ps = 0;
      for (let i = lo; i <= hi; i++) { ws += row[i]; ps += row[i] * CREPE_CENTS[i]; }
      const cents10 = ps / ws;
      hz[start + k] = 10 * Math.pow(2, cents10 / 1200);
      conf[start + k] = m;
    }
    onProgress?.((start + b) / nFrames);
    await new Promise((r) => setTimeout(r, 0)); // UI 양보
  }
  return { hz, conf };
}

async function runPitchy(samples, onProgress) {
  const nFrames = frameCount(samples);
  const pad = padded(samples);
  const det = pitchy.PitchDetector.forFloat32Array(WIN);
  const hz = new Float32Array(nFrames);
  const conf = new Float32Array(nFrames);
  const frame = new Float32Array(WIN);
  for (let f = 0; f < nFrames; f++) {
    frame.set(pad.subarray(f * HOP, f * HOP + WIN));
    const [p, clarity] = det.findPitch(frame, SR);
    hz[f] = p;
    conf[f] = clarity;
    if (f % 2000 === 0) { onProgress?.(f / nFrames); await new Promise((r) => setTimeout(r, 0)); }
  }
  return { hz, conf };
}

/** 프레임별 RMS(dB). 리버브 꼬리·잔류 노이즈를 confidence만으로는 못 거르므로 에너지 게이트에 쓴다 */
function frameRmsDb(samples) {
  const n = frameCount(samples);
  const pad = padded(samples);
  const db = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sq = 0;
    const off = f * HOP;
    for (let i = 0; i < WIN; i++) sq += pad[off + i] * pad[off + i];
    db[f] = 10 * Math.log10(sq / WIN + 1e-12);
  }
  return db;
}

/** 트랙의 상위 5% RMS 대비 gateDb 이하인 프레임은 무성 처리 */
function energyGate(rmsDb, gateDb) {
  const sorted = Float32Array.from(rmsDb).sort();
  const ref = sorted[Math.floor(sorted.length * 0.95)];
  return rmsDb.map((d) => d >= ref + gateDb);
}

/** SPEC의 PitchTrack 형태로. confidence < thr 또는 에너지 게이트 밖이면 null */
function toPitchTrack({ hz, conf }, thr, loud) {
  const n = hz.length;
  const f0Cents = new Array(n);
  const confidence = new Array(n);
  for (let i = 0; i < n; i++) {
    confidence[i] = +conf[i].toFixed(3);
    const ok = conf[i] >= thr && (!loud || loud[i]) && hz[i] > 0 && isFinite(hz[i]);
    f0Cents[i] = ok ? +hzToMidiCents(hz[i]).toFixed(1) : null;
  }
  return { hopMs: HOP_MS, frames: n, f0Cents, confidence };
}

/** 정답 PitchTrack과 비교. 정답 유성 프레임 기준 RPA/옥타브 에러/보이싱 */
function scoreAgainst(track, truth) {
  const n = Math.min(track.frames, truth.f0Cents.length);
  let tv = 0, tu = 0, tp = 0, fv = 0, within50 = 0, octave = 0;
  const errs = [];
  for (let i = 0; i < n; i++) {
    const t = truth.f0Cents[i], e = track.f0Cents[i];
    if (t == null) { tu++; if (e != null) fv++; continue; }
    tv++;
    if (e == null) continue;
    tp++;
    const d = e - t;
    errs.push(Math.abs(d));
    if (Math.abs(d) <= 50) within50++;
    else if (Math.abs(Math.abs(d) - 1200) <= 50) octave++;
  }
  errs.sort((a, b) => a - b);
  return {
    rpa: within50 / tv,
    octaveErr: octave / tv,
    voicingRecall: tp / tv,
    falseVoicing: tu ? fv / tu : 0,
    medianAbsErr: errs.length ? errs[Math.floor(errs.length / 2)] : null,
  };
}

function draw(tracks, truth) {
  const cv = $('plot');
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  const frames = Math.max(...tracks.map((t) => t.track.frames), truth?.f0Cents.length ?? 0);
  const yMin = 3600, yMax = 8400; // MIDI 36~84
  const X = (f) => (f / frames) * cv.width;
  const Y = (c) => cv.height - ((c - yMin) / (yMax - yMin)) * cv.height;
  g.strokeStyle = '#8884';
  g.lineWidth = 1;
  for (let m = 36; m <= 84; m += 12) { g.beginPath(); g.moveTo(0, Y(m * 100)); g.lineTo(cv.width, Y(m * 100)); g.stroke(); }
  const sec = frames * HOP_MS / 1000;
  for (let s = 0; s <= sec; s += 10) { g.beginPath(); g.moveTo(X(s * 100), 0); g.lineTo(X(s * 100), cv.height); g.stroke(); }

  const plot = (cents, color, size) => {
    g.fillStyle = color;
    for (let i = 0; i < cents.length; i++) if (cents[i] != null) g.fillRect(X(i), Y(cents[i]) - size / 2, Math.max(1, cv.width / frames), size);
  };
  if (truth) plot(truth.f0Cents, '#999', 6);
  for (const t of tracks) plot(t.track.f0Cents, t.color, 3);
}

function renderStats(rows) {
  const keys = Object.keys(rows[0]);
  const fmt = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(3)) : v ?? '-');
  $('stats').innerHTML =
    `<tr>${keys.map((k) => `<th>${k}</th>`).join('')}</tr>` +
    rows.map((r) => `<tr>${keys.map((k) => `<td>${fmt(r[k])}</td>`).join('')}</tr>`).join('');
}

/** 헤드리스 자동화에서도 호출한다. 반환값은 JSON 직렬화 가능 */
async function analyze(file, { crepe = true, pitchyOn = true, truth = null, thr = { crepe: 0.5, pitchy: 0.9 }, gateDb = -30 } = {}) {
  const t0 = performance.now();
  const samples = await decodeTo16kMono(file);
  const decodeMs = performance.now() - t0;
  const durationS = samples.length / SR;
  status(`디코딩 ${decodeMs.toFixed(0)}ms, ${durationS.toFixed(1)}초`);
  const loud = gateDb == null ? null : energyGate(frameRmsDb(samples), gateDb);

  const out = { file: file.name, durationS, decodeMs, backend: tf.getBackend(), gateDb, methods: {} };
  const tracks = [];
  if (crepe) {
    const t1 = performance.now();
    const r = await runCrepe(samples, (p) => status(`CREPE ${(p * 100).toFixed(0)}%`));
    const ms = performance.now() - t1;
    const track = toPitchTrack(r, thr.crepe, loud);
    out.methods.crepe = { ms, track, score: truth ? scoreAgainst(track, truth) : null };
    tracks.push({ name: 'crepe', track, color: '#2b7fff' });
  }
  if (pitchyOn) {
    const t1 = performance.now();
    const r = await runPitchy(samples, (p) => status(`pitchy ${(p * 100).toFixed(0)}%`));
    const ms = performance.now() - t1;
    const track = toPitchTrack(r, thr.pitchy, loud);
    out.methods.pitchy = { ms, track, score: truth ? scoreAgainst(track, truth) : null };
    tracks.push({ name: 'pitchy', track, color: '#ff8c2b' });
  }

  draw(tracks, truth);
  renderStats(
    tracks.map(({ name, track }) => {
      const m = out.methods[name];
      const voiced = track.f0Cents.filter((c) => c != null).length / track.frames;
      return {
        method: name, backend: out.backend, ms: Math.round(m.ms), 'x realtime': (durationS * 1000) / m.ms,
        'voiced %': voiced * 100, ...(m.score ?? {}),
      };
    }),
  );
  status(`완료. ${Object.entries(out.methods).map(([k, v]) => `${k} ${v.ms.toFixed(0)}ms`).join(', ')}`);
  return out;
}

window.__spike = { analyze, ready: loadModel() };

// ---- UI ----
let lastResult = null;
$('file').addEventListener('change', () => { $('run').disabled = !$('file').files[0]; });
$('run').addEventListener('click', async () => {
  const file = $('file').files[0];
  if (!file) return;
  let truth = null;
  if ($('truth').files[0]) truth = JSON.parse(await $('truth').files[0].text());
  $('run').disabled = true;
  try {
    await window.__spike.ready;
    lastResult = await analyze(file, { crepe: $('useCrepe').checked, pitchyOn: $('usePitchy').checked, truth });
    $('download').disabled = false;
  } catch (e) {
    status(`에러: ${e.message}`);
    console.error(e);
  } finally {
    $('run').disabled = false;
  }
});
$('download').addEventListener('click', () => {
  if (!lastResult) return;
  const blob = new Blob([JSON.stringify(lastResult)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${lastResult.file}.pitch.json`;
  a.click();
});

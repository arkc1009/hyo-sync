// 합성 "보컬" 테스트 WAV + 정답 PitchTrack 생성기
// node gen-test-wav.mjs [--only=a,b] [outDir]
// 실제 녹음본을 대체하진 못하지만, 파이프라인이 수치적으로 맞는지와 처리 시간을 재는 데 쓴다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(import.meta.dirname, 'testdata');
const SR = 44100; // 일부러 16k가 아닌 흔한 녹음 샘플레이트
const HOP_MS = 10;

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** 멜로디 → 샘플별 f0(Hz) / 게이트(0|1) */
function melody({ seconds, lowMidi, highMidi, seed }) {
  const r = rng(seed);
  const n = Math.floor(seconds * SR);
  const f0 = new Float64Array(n);
  const gate = new Uint8Array(n);
  let t = 0, i = 0, prev = (lowMidi + highMidi) / 2, notesSinceBreath = 0;
  while (t < n) {
    if (notesSinceBreath >= 4 + Math.floor(r() * 3)) {
      t += Math.floor((0.3 + r() * 0.2) * SR); // 호흡 300~500ms
      notesSinceBreath = 0;
      continue;
    }
    let midi = prev + Math.round((r() - 0.5) * 8);
    midi = Math.max(lowMidi, Math.min(highMidi, midi));
    const dur = Math.floor((0.3 + r() * 0.6) * SR);
    const glide = Math.floor(0.04 * SR);
    for (let k = 0; k < dur && t + k < n; k++) {
      const m = k < glide ? prev + (midi - prev) * (k / glide) : midi;
      const tt = (t + k) / SR;
      const vib = k > 0.15 * SR ? 25 * Math.sin(2 * Math.PI * 5.5 * tt) : 0; // ±25 cent
      f0[t + k] = 440 * 2 ** ((m - 69) / 12 + vib / 1200);
      gate[t + k] = 1;
    }
    t += dur;
    prev = midi;
    notesSinceBreath++;
    i++;
  }
  return { f0, gate };
}

/** 배음 합성 + 엔벨로프 + 노이즈. harmonics: 배음별 진폭(기본 1/h^1.2), reverbS: 단순 콤 리버브 */
function synth({ f0, gate, snrDb = Infinity, hum = false, seed = 1, harmonics = null, reverbS = 0 }) {
  const r = rng(seed);
  const n = f0.length;
  const y = new Float64Array(n);
  const amp = harmonics ?? Array.from({ length: 8 }, (_, k) => 1 / (k + 1) ** 1.2);
  let phase = 0;
  const att = Math.floor(0.03 * SR);
  let env = 0;
  for (let i = 0; i < n; i++) {
    env += gate[i] ? (1 - env) / att : -env / att; // 30ms 어택/릴리즈
    if (f0[i] > 0) phase += (2 * Math.PI * f0[i]) / SR;
    let s = 0;
    for (let h = 1; h <= amp.length; h++) s += amp[h - 1] * Math.sin(h * phase);
    y[i] = 0.3 * env * s;
  }
  if (reverbS > 0) {
    // 서로소 지연의 콤 필터 4개 병렬 (Schroeder 흉내). 꼬리 길이 ≈ reverbS
    const delays = [1557, 1617, 1491, 1422].map((d) => Math.round((d * SR) / 44100));
    const g = delays.map((d) => Math.pow(0.001, d / (reverbS * SR)));
    const wet = new Float64Array(n);
    for (let k = 0; k < delays.length; k++) {
      const d = delays[k], buf = new Float64Array(n);
      for (let i = 0; i < n; i++) buf[i] = y[i] + (i >= d ? g[k] * buf[i - d] : 0);
      for (let i = 0; i < n; i++) wet[i] += buf[i] / delays.length;
    }
    for (let i = 0; i < n; i++) y[i] = 0.6 * y[i] + 0.4 * wet[i];
  }
  if (isFinite(snrDb)) {
    let p = 0;
    for (let i = 0; i < n; i++) p += y[i] * y[i];
    const sigRms = Math.sqrt(p / n);
    const noiseRms = sigRms / 10 ** (snrDb / 20);
    for (let i = 0; i < n; i++) y[i] += noiseRms * (r() * 2 - 1) * Math.sqrt(3);
  }
  if (hum) for (let i = 0; i < n; i++) y[i] += 0.02 * Math.sin((2 * Math.PI * 60 * i) / SR);
  return y;
}

function wav(y) {
  const n = y.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(y[i] * 32767))), 44 + i * 2);
  return buf;
}

/** 정답: 프레임 중심 시각의 f0 → A4=6900 cent. 게이트 꺼진 곳(릴리즈 포함)은 null */
function truth({ f0, gate }) {
  const frames = Math.floor((f0.length * 16000) / SR / 160) + 1;
  const f0Cents = [];
  for (let f = 0; f < frames; f++) {
    const i = Math.min(f0.length - 1, Math.round((f * HOP_MS * SR) / 1000));
    f0Cents.push(gate[i] && f0[i] > 0 ? +(1200 * Math.log2(f0[i] / 440) + 6900).toFixed(1) : null);
  }
  return { hopMs: HOP_MS, frames, f0Cents, confidence: f0Cents.map((c) => (c == null ? 0 : 1)) };
}

const CASES = [
  { name: 'clean', seconds: 30, lowMidi: 57, highMidi: 72, seed: 1 },                                  // 중음역, 깨끗
  { name: 'low', seconds: 30, lowMidi: 40, highMidi: 52, seed: 2 },                                    // 저음역 (옥타브 에러 유도)
  { name: 'noisy', seconds: 30, lowMidi: 57, highMidi: 72, seed: 3, snrDb: 10, hum: true },            // 폰 녹음 흉내
  { name: 'long', seconds: 240, lowMidi: 55, highMidi: 74, seed: 4, snrDb: 25 },                       // 4분, 처리 시간 측정용
  // 기본파가 약하고 2배음이 센 음색 + 저음역: 자기상관 계열의 옥타브 에러 유도
  { name: 'octave', seconds: 30, lowMidi: 43, highMidi: 55, seed: 5, snrDb: 20, harmonics: [0.15, 1, 0.5, 0.6, 0.3, 0.2, 0.1, 0.05] },
  // 방 울림 (1.2초 꼬리) + 노이즈: 폰으로 방에서 녹음한 느낌
  { name: 'reverb', seconds: 30, lowMidi: 57, highMidi: 72, seed: 6, snrDb: 15, reverbS: 1.2 },
];

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',');
mkdirSync(OUT, { recursive: true });
for (const c of CASES) {
  if (only && !only.includes(c.name)) continue;
  const m = melody(c);
  const y = synth({ ...m, snrDb: c.snrDb, hum: c.hum, seed: c.seed, harmonics: c.harmonics, reverbS: c.reverbS });
  writeFileSync(join(OUT, `${c.name}.wav`), wav(y));
  writeFileSync(join(OUT, `${c.name}.truth.json`), JSON.stringify(truth(m)));
  console.log(`${c.name}: ${c.seconds}s`);
}

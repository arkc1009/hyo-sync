import { describe, expect, it } from "vitest";
import { compare } from "@/lib/analysis/compare";
import {
  energyEnvelope,
  estimateOffsetFromEnvelope,
  estimateOffsetFromPitch,
  isConfident,
  shiftPitchTrack,
  validateOffsetMs,
} from "@/lib/analysis/sync";
import { SYNC } from "@/lib/analysis/thresholds";
import type { PitchTrack } from "@/lib/analysis/types";
import { HOP, MELODY, makeTrack, type NoteSpec } from "./fixtures";

/** 4소절 멜로디를 변주해 가며 반복한 3분쯤 되는 곡 */
function longSong(): NoteSpec[][] {
  const out: NoteSpec[][] = [];
  for (let r = 0; r < 12; r++) {
    for (const ph of MELODY) out.push(ph.map((n, i) => ({ midi: n.midi + ((r + i) % 3) - 1, ms: n.ms + ((r * 37 + i * 53) % 120) })));
  }
  return out;
}

const SONG = longSong();
const guide = makeTrack({ phrases: SONG, leadMs: 2000 });

/** 녹음본 흉내: 앞에 offsetMs 만큼 무성 추가(−면 잘라냄) + 음정 흔들림 + 군데군데 무성 */
function recording(offsetMs: number, opts: { cents?: number; dropEvery?: number } = {}): PitchTrack {
  const base = makeTrack({ phrases: SONG, leadMs: 2000, pitchShift: Object.fromEntries(SONG.map((_, i) => [i, opts.cents ?? 0])) });
  const f0 = base.f0Cents.map((c, i) => {
    if (c == null) return null;
    if (opts.dropEvery && i % opts.dropEvery === 0) return null;
    return c + 15 * Math.sin(i / 7);
  });
  const t: PitchTrack = { ...base, f0Cents: f0, confidence: f0.map((c) => (c == null ? 0 : 0.9)) };
  // shiftPitchTrack(x, o)[i] = x[i + o] 이므로 반대로 옮기면 "녹음본 = 가이드 + offset"
  return shiftPitchTrack(t, -offsetMs);
}

describe("estimateOffsetFromPitch", () => {
  it.each([0, 120, 1530, -870, 9000])("녹음본이 %ims 밀렸으면 그만큼 찾는다", (off) => {
    const e = estimateOffsetFromPitch(guide, recording(off));
    expect(Math.abs(e.offsetMs - off)).toBeLessThanOrEqual(HOP);
    expect(isConfident(e)).toBe(true);
  });

  it("음정이 전체로 30¢ 높고 무성 프레임이 섞여도 찾는다", () => {
    const e = estimateOffsetFromPitch(guide, recording(640, { cents: 30, dropEvery: 4 }));
    expect(Math.abs(e.offsetMs - 640)).toBeLessThanOrEqual(HOP);
  });

  it("한 옥타브 아래로 불러도 찾는다", () => {
    const e = estimateOffsetFromPitch(guide, recording(-300, { cents: -1200 }));
    expect(Math.abs(e.offsetMs + 300)).toBeLessThanOrEqual(HOP);
  });

  it("전혀 다른 곡선(무성뿐)이면 신뢰도 0", () => {
    const silent: PitchTrack = { hopMs: HOP, frames: 1000, f0Cents: Array(1000).fill(null), confidence: Array(1000).fill(0) };
    const e = estimateOffsetFromPitch(guide, silent);
    expect(e.offsetMs).toBe(0);
    expect(isConfident(e)).toBe(false);
  });

  it("4분 곡도 1초 안에", () => {
    const t0 = performance.now();
    estimateOffsetFromPitch(guide, recording(2500));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("compare + syncOffsetMs", () => {
  it("밀린 녹음본도 오프셋을 넣으면 전부 OK, 소절 위치는 원래 녹음본 시각", () => {
    const off = 1530;
    const sub = shiftPitchTrack(makeTrack({ phrases: MELODY }), -off);
    const g = makeTrack({ phrases: MELODY });
    const without = compare(g, sub);
    expect(without.phrases.some((p) => p.verdict !== "OK")).toBe(true);

    const r = compare(g, sub, off);
    expect(r.phrases.every((p) => p.verdict === "OK")).toBe(true);
    expect(r.globalOffsetMs).toBe(0);
    for (const p of r.phrases) expect(p.subStartMs - p.guideStartMs).toBe(off);
  });
});

/** 합성 보컬: 소절마다 노트 주파수 사인 + 배음, 노트 시작마다 어택. 가이드와 녹음본은 배음·잡음·크기를 다르게 */
function synth(phrases: NoteSpec[][], opts: { rate: number; offsetMs: number; harmonics: number[]; gain: number; noise: number; seed: number }) {
  const { rate } = opts;
  const lead = 2000 + opts.offsetMs;
  let total = lead;
  for (const ph of phrases) total += ph.reduce((a, n) => a + n.ms, 0) + 400;
  const out = new Float32Array(Math.max(1, Math.round((total * rate) / 1000)));
  let seed = opts.seed;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let i = 0; i < out.length; i++) out[i] = rand() * opts.noise;
  let t = lead;
  for (const ph of phrases) {
    for (const n of ph) {
      const f = 440 * 2 ** ((n.midi - 69) / 12);
      const s0 = Math.round((t * rate) / 1000);
      const len = Math.round((n.ms * rate) / 1000);
      for (let k = 0; k < len && s0 + k < out.length; k++) {
        if (s0 + k < 0) continue;
        const env = Math.min(1, k / (0.03 * rate)) * (1 - 0.4 * (k / len));
        let v = 0;
        opts.harmonics.forEach((h, j) => { v += h * Math.sin((2 * Math.PI * f * (j + 1) * k) / rate); });
        out[s0 + k] += opts.gain * env * v;
      }
      t += n.ms;
    }
    t += 400;
  }
  return out;
}

describe("estimateOffsetFromEnvelope", () => {
  const rate = 8000;
  const phrases = SONG.slice(0, 20);
  const g = energyEnvelope(synth(phrases, { rate, offsetMs: 0, harmonics: [1, 0.5, 0.25], gain: 0.5, noise: 0.002, seed: 1 }), rate);

  it.each([0, 250, -600, 3200])("음색·크기·잡음이 달라도 %ims 를 찾는다", (off) => {
    const s = energyEnvelope(synth(phrases, { rate, offsetMs: off, harmonics: [0.6, 0.9, 0.1, 0.3], gain: 0.15, noise: 0.01, seed: 7 }), rate);
    const e = estimateOffsetFromEnvelope(g, s);
    expect(Math.abs(e.offsetMs - off)).toBeLessThanOrEqual(2 * SYNC.envelopeHopMs);
    expect(isConfident(e)).toBe(true);
  });

  it("잡음뿐인 녹음본이면 신뢰도가 낮다", () => {
    const noise = energyEnvelope(synth([], { rate, offsetMs: 40000, harmonics: [1], gain: 0, noise: 0.05, seed: 3 }), rate);
    expect(isConfident(estimateOffsetFromEnvelope(g, noise))).toBe(false);
  });
});

describe("validateOffsetMs", () => {
  it("범위 안 정수만", () => {
    expect(validateOffsetMs(12.4)).toBe(12);
    expect(validateOffsetMs(-SYNC.maxOffsetMs)).toBe(-SYNC.maxOffsetMs);
    expect(validateOffsetMs(SYNC.maxOffsetMs + 1)).toBeNull();
    expect(validateOffsetMs("10")).toBeNull();
    expect(validateOffsetMs(NaN)).toBeNull();
  });
});

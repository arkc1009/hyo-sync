// 녹음 파일 시작 싱크 자동 맞추기. 순수 함수 (DOM·DB 접근 없음, vitest 로 테스트)
//
// 오프셋 규약: offsetMs = 녹음본 시각 − 가이드 시각.
//   +면 녹음본 앞에 여유가 더 있음(같은 소리가 녹음본에서 늦게 나옴), −면 녹음본이 늦게 시작해 앞이 잘림.
//   믹서는 가이드(= INST) 시각 t 에서 녹음본의 t + offsetMs 를 재생한다.
//
// 두 가지 특징으로 찾는다.
//   - 피치 곡선 (가이드 비교 제출): 양쪽 다 유성인 프레임의 음정 일치도 합이 가장 큰 시프트. 서버에서 계산
//   - 에너지 엔벨로프 (믹스용 트랙, 피치 없음): 10ms 레벨 곡선의 상호상관. 브라우저가 디코딩해서 넘긴다

import { SYNC } from "./thresholds";
import type { PitchTrack } from "./types";

export interface SyncEstimate {
  offsetMs: number;
  /** 0~1. 1등 시프트가 두 번째 후보(±SYNC.peakExclusionMs 밖)보다 얼마나 뚜렷한지. 낮으면 믿지 않는다 */
  confidence: number;
}

/** 시프트(프레임) 하나의 점수. lag 은 녹음본 프레임 = 가이드 프레임 + lag */
type ScoreFn = (lag: number) => number;

/**
 * 거친 탐색(SYNC.coarseStepMs 간격) → 1등 근처를 1프레임 간격으로 → 포물선 보간으로 프레임 이하까지.
 * 4분 곡·±15초면 거친 탐색이 600번 × 24,000프레임 ≈ 1,400만 번 비교 (수십 ms)
 */
function searchLag(score: ScoreFn, maxLag: number, hopMs: number): SyncEstimate {
  const step = Math.max(1, Math.round(SYNC.coarseStepMs / hopMs));
  const coarse: { lag: number; s: number }[] = [];
  for (let lag = -maxLag; lag <= maxLag; lag += step) coarse.push({ lag, s: score(lag) });
  let best = coarse[0];
  for (const c of coarse) if (c.s > best.s) best = c;
  if (!(best.s > 0)) return { offsetMs: 0, confidence: 0 };

  const fine = new Map<number, number>();
  const at = (lag: number) => {
    if (!fine.has(lag)) fine.set(lag, score(lag));
    return fine.get(lag)!;
  };
  let lag = best.lag;
  for (let l = Math.max(-maxLag, best.lag - step); l <= Math.min(maxLag, best.lag + step); l++) if (at(l) > at(lag)) lag = l;

  // 포물선 보간 (양옆이 범위 안일 때만)
  let frac = 0;
  if (lag > -maxLag && lag < maxLag) {
    const a = at(lag - 1), b = at(lag), c = at(lag + 1);
    const denom = a - 2 * b + c;
    if (denom < 0) frac = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  }

  // 두 번째 후보: 1등에서 peakExclusionMs 넘게 떨어진 거친 탐색 최고점
  const excl = SYNC.peakExclusionMs / hopMs;
  let second = 0;
  for (const c of coarse) if (Math.abs(c.lag - lag) > excl && c.s > second) second = c.s;
  const confidence = Math.max(0, Math.min(1, 1 - second / at(lag)));
  return { offsetMs: Math.round((lag + frac) * hopMs), confidence: Math.round(confidence * 1000) / 1000 };
}

/** 옥타브 차이는 무시하고 [-600, 600] cent 로 접는다 (남녀가 같은 멜로디를 옥타브 달리 부를 때) */
function foldCents(d: number) {
  const r = ((d % 1200) + 1200) % 1200;
  return r > 600 ? r - 1200 : r;
}

/** 가이드·녹음본 피치 곡선으로 시작 오프셋 추정. 두 트랙의 hopMs 는 같아야 한다 */
export function estimateOffsetFromPitch(guide: PitchTrack, sub: PitchTrack, maxOffsetMs: number = SYNC.maxOffsetMs): SyncEstimate {
  if (guide.hopMs !== sub.hopMs) throw new Error(`hopMs 불일치: guide ${guide.hopMs}, sub ${sub.hopMs}`);
  const hop = guide.hopMs;
  const g = guide.f0Cents;
  const s = sub.f0Cents;
  const tol = SYNC.pitchToleranceCents;
  const score: ScoreFn = (lag) => {
    let sum = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(g.length, s.length - lag);
    for (let i = from; i < to; i++) {
      const gc = g[i];
      if (gc == null) continue;
      const sc = s[i + lag];
      if (sc == null) continue;
      // 음정이 맞으면 +, 둘 다 유성인데 음정이 다르면 − (유성 구간만 겹친 엉뚱한 시프트가 점수를 못 받게)
      sum += Math.max(0, 1 - Math.abs(foldCents(sc - gc)) / tol) - SYNC.pitchMismatchPenalty;
    }
    return sum;
  };
  const maxLag = Math.round(maxOffsetMs / hop);
  return searchLag(score, maxLag, hop);
}

/**
 * 모노 샘플 → hopMs 간격 레벨 곡선 (0~1, 평균 뺀 값).
 * dB 로 바꿔 상위 SYNC.envelopeRangeDb 만 남긴다 → 녹음 크기·마이크 차이에 덜 민감하다
 */
export function energyEnvelope(samples: Float32Array, sampleRate: number, hopMs: number = SYNC.envelopeHopMs): Float32Array {
  const hop = Math.max(1, Math.round((sampleRate * hopMs) / 1000));
  const n = Math.floor(samples.length / hop);
  const db = new Float32Array(n);
  let top = -Infinity;
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += samples[i] * samples[i];
    const v = 10 * Math.log10(sum / hop + 1e-12);
    db[f] = v;
    if (v > top) top = v;
  }
  const floor = top - SYNC.envelopeRangeDb;
  let mean = 0;
  for (let f = 0; f < n; f++) {
    db[f] = Math.max(0, db[f] - floor) / SYNC.envelopeRangeDb;
    mean += db[f];
  }
  mean = n ? mean / n : 0;
  for (let f = 0; f < n; f++) db[f] -= mean;
  return db;
}

/** 레벨 곡선 두 개(energyEnvelope, 같은 hopMs)로 시작 오프셋 추정 */
export function estimateOffsetFromEnvelope(
  guide: Float32Array,
  sub: Float32Array,
  hopMs: number = SYNC.envelopeHopMs,
  maxOffsetMs: number = SYNC.maxOffsetMs,
): SyncEstimate {
  const score: ScoreFn = (lag) => {
    let sum = 0;
    const from = Math.max(0, -lag);
    const to = Math.min(guide.length, sub.length - lag);
    for (let i = from; i < to; i++) sum += guide[i] * sub[i + lag];
    return sum;
  };
  return searchLag(score, Math.round(maxOffsetMs / hopMs), hopMs);
}

/** 자동 추정을 그대로 적용해도 되는지 */
export function isConfident(e: SyncEstimate) {
  return e.confidence >= SYNC.minConfidence;
}

/**
 * 녹음본 피치를 가이드 시각으로 옮긴다: 결과[i] = sub[i + offset 프레임].
 * 앞이 잘린 녹음본(−)은 앞을 무성으로 채운다
 */
export function shiftPitchTrack(sub: PitchTrack, offsetMs: number): PitchTrack {
  const lag = Math.round(offsetMs / sub.hopMs);
  if (lag === 0) return sub;
  const f0: (number | null)[] = [];
  const conf: number[] = [];
  const start = Math.max(0, -lag);
  for (let i = 0; i < start; i++) { f0.push(null); conf.push(0); }
  for (let j = Math.max(0, lag); j < sub.frames; j++) { f0.push(sub.f0Cents[j]); conf.push(sub.confidence[j]); }
  // 오프셋이 녹음 길이보다 크면 빈 트랙 → 무성 1프레임 (DTW 가 빈 입력을 받지 않게)
  if (f0.length === 0) { f0.push(null); conf.push(0); }
  return { hopMs: sub.hopMs, frames: f0.length, f0Cents: f0, confidence: conf };
}

/** 클라이언트가 보낸 오프셋 검증. 정수 ms, ±SYNC.maxOffsetMs 안 */
export function validateOffsetMs(x: unknown): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  const r = Math.round(x);
  return Math.abs(r) <= SYNC.maxOffsetMs ? r : null;
}

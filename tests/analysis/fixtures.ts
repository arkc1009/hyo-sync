// 합성 PitchTrack 생성기. 소절 = {노트(MIDI), 길이 ms}, 소절 사이 gapMs 무성
import type { PitchTrack } from "@/lib/analysis/types";

export const HOP = 10;

export interface NoteSpec {
  midi: number;
  ms: number;
}

export interface TrackOpts {
  /** 각 소절의 노트 배열 */
  phrases: NoteSpec[][];
  gapMs?: number;
  /** 시작 전 무성 길이 */
  leadMs?: number;
  /** 소절별 cent 오프셋 (index → cents) */
  pitchShift?: Record<number, number>;
  /** 소절별 ms 시프트 (+ 늦음). 소절 앞 gap 에서 빌려오고 뒤 gap 에 돌려준다 */
  timeShift?: Record<number, number>;
  /** 전체 ms 시프트 */
  globalShiftMs?: number;
  /** 소절 index → 무성으로 비움 */
  mute?: number[];
}

export function makeTrack(o: TrackOpts): PitchTrack {
  const gap = o.gapMs ?? 400;
  const lead = o.leadMs ?? 200;
  const cents: (number | null)[] = [];
  const push = (c: number | null, ms: number) => {
    for (let i = 0; i < Math.round(ms / HOP); i++) cents.push(c);
  };
  const shiftOf = (idx: number) => o.timeShift?.[idx] ?? 0;
  push(null, lead + (o.globalShiftMs ?? 0) + shiftOf(0));
  o.phrases.forEach((notes, idx) => {
    const pshift = o.pitchShift?.[idx] ?? 0;
    const muted = o.mute?.includes(idx);
    // 소절 앞 무성 = 기본 gap + 이 소절 시프트 − 앞 소절 시프트 (앞 소절이 밀린 만큼 되돌려 뒤는 제자리)
    if (idx > 0) push(null, gap + shiftOf(idx) - shiftOf(idx - 1));
    for (const n of notes) push(muted ? null : n.midi * 100 + pshift, n.ms);
  });
  push(null, gap);
  if ((o.globalShiftMs ?? 0) < 0) cents.splice(0, Math.round(-(o.globalShiftMs ?? 0) / HOP));
  return {
    hopMs: HOP,
    frames: cents.length,
    f0Cents: cents,
    confidence: cents.map((c) => (c == null ? 0 : 1)),
  };
}

/** 4소절짜리 기본 멜로디 */
export const MELODY: NoteSpec[][] = [
  [{ midi: 60, ms: 500 }, { midi: 62, ms: 500 }, { midi: 64, ms: 600 }],
  [{ midi: 65, ms: 400 }, { midi: 67, ms: 800 }],
  [{ midi: 64, ms: 500 }, { midi: 62, ms: 500 }, { midi: 60, ms: 700 }],
  [{ midi: 67, ms: 600 }, { midi: 65, ms: 600 }, { midi: 64, ms: 400 }],
];

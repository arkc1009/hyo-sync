import type { Reason, Verdict } from "@/lib/analysis/types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  OK: "OK",
  FIXABLE: "보정 가능",
  RERECORD: "재녹음",
  UNRELIABLE: "판정 불가",
};

export const VERDICT_COLOR: Record<Verdict, string> = {
  OK: "#3cb371",
  FIXABLE: "#f0b429",
  RERECORD: "#e5484d",
  UNRELIABLE: "#9a9a9a",
};

export const REASON_LABEL: Record<Reason, string> = {
  PITCH_SHARP: "음정 높음",
  PITCH_FLAT: "음정 낮음",
  TIMING_EARLY: "박자 빠름",
  TIMING_LATE: "박자 늦음",
  LOW_COVERAGE: "유성 구간 부족",
};

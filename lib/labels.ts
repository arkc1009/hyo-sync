import type { Reason, Verdict } from "@/lib/analysis/types";

export const VERDICT_LABEL: Record<Verdict, string> = {
  OK: "OK",
  FIXABLE: "보정 가능",
  RERECORD: "재녹음",
  UNRELIABLE: "판정 불가",
};

/** 판정 색. app/globals.css 의 토큰 (테마에 따라 바뀜) */
export const VERDICT_COLOR: Record<Verdict, string> = {
  OK: "var(--ok)",
  FIXABLE: "var(--fixable)",
  RERECORD: "var(--rerecord)",
  UNRELIABLE: "var(--unreliable)",
};

/** Badge tone 이름 (components/ui/Badge) */
export const VERDICT_TONE = {
  OK: "ok",
  FIXABLE: "fixable",
  RERECORD: "rerecord",
  UNRELIABLE: "unreliable",
} as const satisfies Record<Verdict, string>;

export const REASON_LABEL: Record<Reason, string> = {
  PITCH_SHARP: "음정 높음",
  PITCH_FLAT: "음정 낮음",
  TIMING_EARLY: "박자 빠름",
  TIMING_LATE: "박자 늦음",
  LOW_COVERAGE: "유성 구간 부족",
};

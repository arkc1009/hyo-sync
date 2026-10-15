// 분석 라이브러리 공용 타입. docs/SPEC.md "데이터 모델" 의 PitchTrack / PhraseResult 와 1:1

/** 브라우저에서 추출한 피치 곡선. f0Cents 는 A4=440Hz 를 6900 으로 두는 MIDI cent (MIDI 69 = 6900) */
export interface PitchTrack {
  hopMs: number;
  frames: number;
  /** null = 무성(confidence 미달 또는 에너지 게이트 밖) */
  f0Cents: (number | null)[];
  confidence: number[];
}

export type Verdict = "OK" | "FIXABLE" | "RERECORD" | "UNRELIABLE";

export type Reason =
  | "PITCH_SHARP"
  | "PITCH_FLAT"
  | "TIMING_EARLY"
  | "TIMING_LATE"
  | "LOW_COVERAGE";

/** 가이드 기준 소절 구간(프레임 인덱스, end 는 exclusive) */
export interface Phrase {
  index: number;
  startFrame: number;
  endFrame: number;
}

export interface PhraseResult {
  index: number;
  guideStartMs: number;
  guideEndMs: number;
  subStartMs: number;
  subEndMs: number;
  pitch: { medianCents: number; meanAbsCents: number };
  /** +면 늦음, −면 빠름 */
  timing: { onsetMs: number; medianMs: number };
  /** 판정에 쓴 유성 프레임 비율 0~1 */
  coverage: number;
  verdict: Verdict;
  reasons: Reason[];
}

export interface ReportSummary {
  ok: number;
  fixable: number;
  rerecord: number;
  unreliable: number;
  /** 가장 나쁜 소절 index 상위 3개 */
  worstPhrases: number[];
}

export interface Report {
  thresholdsVersion: number;
  globalOffsetMs: number;
  summary: ReportSummary;
  phrases: PhraseResult[];
}

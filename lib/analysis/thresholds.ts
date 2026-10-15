// 판정 임계치. 숫자는 여기에만 둔다. 바꾸면 THRESHOLDS_VERSION 을 올리고 Report 를 재계산한다
// 초기값은 추정치 — PLAN 열린 질문 2번, Phase 3 에서 실제 녹음본으로 조정

export const THRESHOLDS_VERSION = 1;

export const THRESHOLDS = {
  /** |pitch.medianCents| : 미만이면 OK, 이상이면 FIXABLE */
  pitchFixableCents: 25,
  /** |pitch.medianCents| : 이상이면 RERECORD */
  pitchRerecordCents: 50,
  /** |timing.onsetMs| : 미만이면 OK, 이상이면 FIXABLE */
  timingFixableMs: 60,
  /** |timing.onsetMs| : 이상이면 RERECORD */
  timingRerecordMs: 120,
  /** coverage 가 이 값 미만이면 UNRELIABLE (판정 보류) */
  coverageMin: 0.5,
  /** 전역 오프셋이 이 값 이상이면 리포트 상단에 첨언 */
  globalOffsetNoticeMs: 60,
} as const;

export const SEGMENTATION = {
  /** 가이드 무성 구간이 이 길이 이상이면 소절 경계 */
  phraseGapMs: 300,
  /** 이보다 짧은 소절은 앞 소절에 합친다 */
  minPhraseMs: 400,
} as const;

export const DTW = {
  /** Sakoe-Chiba 밴드 반폭. SPEC 가정 1(싱크 맞춰 올림) 덕에 좁아도 된다 */
  bandMs: 1000,
  /** 한쪽만 무성인 프레임의 비용(cent 단위와 같은 스케일) */
  unvoicedPenaltyCents: 200,
} as const;

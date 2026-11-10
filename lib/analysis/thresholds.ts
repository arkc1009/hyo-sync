// 판정 임계치. 숫자는 여기에만 둔다. 바꾸면 THRESHOLDS_VERSION 을 올리고 Report 를 재계산한다
// 초기값은 추정치 — PLAN 열린 질문 2번, Phase 3 에서 실제 녹음본으로 조정

// 2: 시작 싱크 자동 맞춤 후 비교 (Submission.syncOffsetMs 만큼 녹음본을 옮겨서 compare)
export const THRESHOLDS_VERSION = 2;

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

/** 시작 싱크 자동 맞추기 (lib/analysis/sync.ts) */
export const SYNC = {
  /** 이 범위(±ms) 안에서만 찾는다. 녹음 버튼을 몇 초 일찍·늦게 누른 정도를 가정 */
  maxOffsetMs: 15_000,
  /** 거친 탐색 간격 */
  coarseStepMs: 50,
  /** 피치 곡선: 이만큼 차이 나면 음정 일치도 0 (옥타브는 접어서 무시) */
  pitchToleranceCents: 150,
  /** 피치 곡선: 둘 다 유성인 프레임마다 빼는 값. 음정이 다른 겹침은 감점이 된다 */
  pitchMismatchPenalty: 0.3,
  /** 에너지 엔벨로프 프레임 간격 */
  envelopeHopMs: 10,
  /** 에너지 엔벨로프: 가장 큰 프레임 아래 이 dB 범위만 쓴다 */
  envelopeRangeDb: 50,
  /** 신뢰도 계산 시 1등 근처 이 범위는 두 번째 후보에서 뺀다 */
  peakExclusionMs: 300,
  /** 신뢰도가 이 값 미만이면 자동 적용하지 않는다 (0 으로 두고 직접 조정 안내) */
  minConfidence: 0.15,
} as const;

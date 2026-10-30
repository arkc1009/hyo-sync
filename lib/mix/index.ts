// 믹서·구간 코멘트용 순수 함수. DOM·DB 접근 없음 (vitest 로 테스트)

export const COMMENT_MAX_LENGTH = 1000;
/** 구간 길이 하한. 시작=끝으로 찍어도 들어볼 수 있게 이보다 짧으면 늘린다 */
export const COMMENT_MIN_RANGE_MS = 500;

export interface CommentInput {
  startMs: number;
  endMs: number;
  body: string;
}

/** 클라이언트가 보낸 코멘트 검증·정규화. durationMs 가 있으면 그 안으로 자른다 */
export function validateComment(
  raw: unknown,
  durationMs?: number,
): { ok: true; value: CommentInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "본문 형식 오류" };
  const r = raw as Record<string, unknown>;
  if (typeof r.startMs !== "number" || !Number.isFinite(r.startMs)) return { ok: false, error: "startMs 필요" };
  if (typeof r.endMs !== "number" || !Number.isFinite(r.endMs)) return { ok: false, error: "endMs 필요" };
  if (typeof r.body !== "string") return { ok: false, error: "body 필요" };
  const body = r.body.trim();
  if (!body) return { ok: false, error: "코멘트 내용이 비어 있어요" };
  if (body.length > COMMENT_MAX_LENGTH) return { ok: false, error: `코멘트는 ${COMMENT_MAX_LENGTH}자까지` };

  let start = Math.round(Math.min(r.startMs, r.endMs));
  let end = Math.round(Math.max(r.startMs, r.endMs));
  start = Math.max(0, start);
  if (end - start < COMMENT_MIN_RANGE_MS) end = start + COMMENT_MIN_RANGE_MS;
  if (durationMs != null && durationMs > 0) {
    end = Math.min(end, durationMs);
    start = Math.min(start, Math.max(0, end - COMMENT_MIN_RANGE_MS));
  }
  return { ok: true, value: { startMs: start, endMs: end, body } };
}

/** (파트, 멤버)마다 가장 높은 테이크 하나만. 입력 순서는 파트 순서를 따른다고 가정하고 유지한다 */
export function latestTakes<T extends { partId: string; userId: string; take: number }>(subs: T[]): T[] {
  const best = new Map<string, T>();
  for (const s of subs) {
    const key = `${s.partId}\u0000${s.userId}`;
    const cur = best.get(key);
    if (!cur || s.take > cur.take) best.set(key, s);
  }
  const keep = new Set(best.values());
  return subs.filter((s) => keep.has(s));
}

export interface ChannelState {
  /** 0~1 */
  volume: number;
  muted: boolean;
  solo: boolean;
}

/** 실제로 GainNode 에 넣을 값. 솔로가 하나라도 있으면 솔로 채널만 들린다 */
export function channelGains(channels: ChannelState[]): number[] {
  const anySolo = channels.some((c) => c.solo);
  return channels.map((c) => {
    if (anySolo ? !c.solo : c.muted) return 0;
    return Math.min(1, Math.max(0, c.volume));
  });
}

/** 기준 시각(초)과 이 정도 넘게 벌어지면 다시 맞춘다 */
export const DRIFT_RESYNC_S = 0.05;

export function needsResync(masterS: number, trackS: number, trackDurationS: number) {
  // 짧은 트랙이 끝난 뒤엔 맞출 필요 없음
  if (masterS >= trackDurationS) return false;
  return Math.abs(masterS - trackS) > DRIFT_RESYNC_S;
}

/** 코멘트 구간을 재생할 때 앞에 붙이는 여유. 앞 소절 흐름을 같이 들어야 판단이 된다 */
export const COMMENT_PREROLL_MS = 1000;

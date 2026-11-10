// 믹서의 시작 싱크 계산. 순수 함수 (DOM·DB 접근 없음, vitest 로 테스트)
// 오프셋 규약은 lib/analysis/sync.ts: 녹음본 시각 = 믹서(가이드·INST) 시각 + offsetMs

import { validateOffsetMs, type SyncEstimate } from "@/lib/analysis/sync";

/** 믹서 시각 t(ms)에서 이 채널이 재생해야 할 파일 위치. 범위 밖이면 before/after */
export function trackPosition(mixMs: number, offsetMs: number, durationMs: number):
  | { state: "before" }
  | { state: "play"; fileMs: number }
  | { state: "after" } {
  const fileMs = mixMs + offsetMs;
  if (fileMs < 0) return { state: "before" };
  if (fileMs >= durationMs) return { state: "after" };
  return { state: "play", fileMs };
}

/** 채널이 믹서 타임라인에서 차지하는 구간 [start, end) ms. 파일 0초는 −offsetMs 에 놓인다 */
export function mixSpan(offsetMs: number, durationMs: number) {
  return { startMs: -offsetMs, endMs: durationMs - offsetMs };
}

/** 믹서 타임라인 전체 길이: 0 부터 가장 늦게 끝나는 채널까지 */
export function mixTotalMs(channels: { offsetMs: number; durationMs: number }[]) {
  return Math.max(1, ...channels.map((c) => mixSpan(c.offsetMs, c.durationMs).endMs));
}

/** 클라이언트가 보낸 { offsetMs, confidence } 검증 */
export function validateSyncEstimate(x: unknown): SyncEstimate | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const offsetMs = validateOffsetMs(r.offsetMs);
  if (offsetMs == null) return null;
  if (typeof r.confidence !== "number" || !(r.confidence >= 0 && r.confidence <= 1)) return null;
  return { offsetMs, confidence: r.confidence };
}

/** "+120ms" / "−45ms" / "0ms" */
export function formatSyncOffset(ms: number) {
  const r = Math.round(ms);
  return r > 0 ? `+${r}ms` : r < 0 ? `−${-r}ms` : "0ms";
}

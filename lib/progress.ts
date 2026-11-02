// 프로젝트 현황판(파트 × 멤버)용 순수 함수. DOM·DB 접근 없음 (vitest 로 테스트)
import type { ReportSummary } from "@/lib/analysis/types";

export type CellStatus =
  | { kind: "none" }
  | { kind: "analyzing" }
  | { kind: "failed" }
  | { kind: "mix" }
  | { kind: "rerecord"; count: number }
  | { kind: "fixable"; count: number }
  | { kind: "ok" };

export interface ProgressSubmission {
  id: string;
  partId: string;
  userId: string;
  take: number;
  status: "UPLOADED" | "ANALYZED" | "FAILED" | "MIX_ONLY";
  summary: ReportSummary | null;
  commentCount: number;
}

/** 최신 테이크 하나로 칸 상태. 재녹음이 하나라도 있으면 재녹음, 보정만 있으면 보정, 아니면 OK */
export function cellStatus(sub: ProgressSubmission | undefined): CellStatus {
  if (!sub) return { kind: "none" };
  if (sub.status === "MIX_ONLY") return { kind: "mix" };
  if (sub.status === "FAILED") return { kind: "failed" };
  if (!sub.summary) return { kind: "analyzing" };
  if (sub.summary.rerecord > 0) return { kind: "rerecord", count: sub.summary.rerecord };
  if (sub.summary.fixable > 0) return { kind: "fixable", count: sub.summary.fixable };
  return { kind: "ok" };
}

/** (파트, 멤버)별 최신 테이크. 키는 `${partId}:${userId}` */
export function latestByCell<T extends Pick<ProgressSubmission, "partId" | "userId" | "take">>(subs: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const s of subs) {
    const key = cellKey(s.partId, s.userId);
    const cur = map.get(key);
    if (!cur || s.take > cur.take) map.set(key, s);
  }
  return map;
}

export function cellKey(partId: string, userId: string) {
  return `${partId}:${userId}`;
}

/** 이 멤버가 손볼 파트: 가이드가 있는데 안 냈거나, 최신 테이크가 재녹음·분석 실패 */
export function todoParts(
  parts: { id: string; name: string; hasGuide: boolean }[],
  latest: Map<string, ProgressSubmission>,
  userId: string,
): { partId: string; name: string; status: CellStatus }[] {
  const out: { partId: string; name: string; status: CellStatus }[] = [];
  for (const p of parts) {
    const status = cellStatus(latest.get(cellKey(p.id, userId)));
    if ((status.kind === "none" && p.hasGuide) || status.kind === "rerecord" || status.kind === "failed") {
      out.push({ partId: p.id, name: p.name, status });
    }
  }
  return out;
}

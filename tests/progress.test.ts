import { describe, expect, it } from "vitest";
import { cellKey, cellStatus, latestByCell, todoParts, type ProgressSubmission } from "@/lib/progress";

const summary = (rerecord: number, fixable: number) => ({ ok: 5, fixable, rerecord, unreliable: 0, worstPhrases: [] });
const sub = (o: Partial<ProgressSubmission>): ProgressSubmission => ({
  id: "s", partId: "p1", userId: "u1", take: 1, status: "ANALYZED", summary: summary(0, 0), commentCount: 0, ...o,
});

describe("cellStatus", () => {
  it("상태별 판정", () => {
    expect(cellStatus(undefined)).toEqual({ kind: "none" });
    expect(cellStatus(sub({ status: "MIX_ONLY", summary: null }))).toEqual({ kind: "mix" });
    expect(cellStatus(sub({ status: "FAILED", summary: null }))).toEqual({ kind: "failed" });
    expect(cellStatus(sub({ status: "UPLOADED", summary: null }))).toEqual({ kind: "analyzing" });
    expect(cellStatus(sub({ summary: summary(2, 3) }))).toEqual({ kind: "rerecord", count: 2 });
    expect(cellStatus(sub({ summary: summary(0, 3) }))).toEqual({ kind: "fixable", count: 3 });
    expect(cellStatus(sub({}))).toEqual({ kind: "ok" });
  });
});

describe("latestByCell", () => {
  it("파트·멤버별 가장 큰 테이크", () => {
    const m = latestByCell([sub({ id: "a", take: 1 }), sub({ id: "b", take: 3 }), sub({ id: "c", take: 2 }), sub({ id: "d", userId: "u2" })]);
    expect(m.get(cellKey("p1", "u1"))?.id).toBe("b");
    expect(m.get(cellKey("p1", "u2"))?.id).toBe("d");
  });
});

describe("todoParts", () => {
  it("가이드 있는데 미제출, 재녹음, 실패만", () => {
    const parts = [
      { id: "p1", name: "멜로디", hasGuide: true },
      { id: "p2", name: "화음1", hasGuide: true },
      { id: "p3", name: "화음2", hasGuide: false },
      { id: "p4", name: "랩", hasGuide: true },
    ];
    const latest = latestByCell([
      sub({ partId: "p1", summary: summary(1, 0) }),
      sub({ partId: "p4", summary: summary(0, 2) }),
    ]);
    expect(todoParts(parts, latest, "u1").map((t) => [t.name, t.status.kind])).toEqual([
      ["멜로디", "rerecord"],
      ["화음1", "none"],
    ]);
  });
});

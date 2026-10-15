import { describe, expect, it } from "vitest";
import { dtw } from "@/lib/analysis/dtw";

describe("dtw", () => {
  it("동일 시퀀스는 대각선 경로, 비용 0", () => {
    const a = [6000, 6000, 6200, 6200, null, 6400];
    const p = dtw(a, a, 2, 200);
    expect(p.totalCost).toBe(0);
    expect(Array.from(p.guideToSub)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("뒤로 밀린 시퀀스를 그만큼 밀어서 대응시킨다", () => {
    const guide = [null, null, 6000, 6000, 6200, 6200, null, null];
    const sub = [null, null, null, null, 6000, 6000, 6200, 6200, null, null];
    const p = dtw(guide, sub, 5, 200);
    // 가이드 2~5 프레임 → 녹음본 4~7
    expect(p.guideToSub[2]).toBe(4);
    expect(p.guideToSub[5]).toBe(7);
  });

  it("밴드 밖으로는 못 나간다", () => {
    const guide = Array.from({ length: 50 }, (_, i) => (i >= 10 && i < 20 ? 6000 : null));
    const sub = Array.from({ length: 50 }, (_, i) => (i >= 30 && i < 40 ? 6000 : null));
    const p = dtw(guide, sub, 3, 200);
    for (let g = 0; g < 50; g++) expect(Math.abs(p.guideToSub[g] - g)).toBeLessThanOrEqual(3);
  });

  it("빈 입력", () => {
    const p = dtw([], [], 3, 200);
    expect(p.guide.length).toBe(0);
    expect(p.totalCost).toBe(0);
  });
});

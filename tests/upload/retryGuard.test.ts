import { describe, expect, it } from "vitest";
import { createRetryGuard } from "@/lib/upload/retryGuard";

describe("createRetryGuard", () => {
  it("진행률이 늘기만 하면 첫 시도", () => {
    const g = createRetryGuard(2);
    expect([0, 10, 50, 99].map((n) => g.onProgress(n))).toEqual([1, 1, 1, 1]);
  });

  it("진행률이 되감기면 다음 시도로 세고, 상한을 넘으면 null", () => {
    const g = createRetryGuard(2);
    g.onProgress(0);
    g.onProgress(90);
    expect(g.onProgress(5)).toBe(2);
    expect(g.onProgress(90)).toBe(2);
    expect(g.onProgress(3)).toBeNull();
  });
});

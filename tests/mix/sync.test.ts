import { describe, expect, it } from "vitest";
import { formatSyncOffset, mixSpan, mixTotalMs, trackPosition, validateSyncEstimate } from "@/lib/mix/sync";

describe("trackPosition", () => {
  it("+오프셋: 파일 앞을 건너뛰고 재생", () => {
    expect(trackPosition(0, 1200, 10_000)).toEqual({ state: "play", fileMs: 1200 });
    expect(trackPosition(8800, 1200, 10_000)).toEqual({ state: "after" });
  });
  it("−오프셋: 그만큼 늦게 시작", () => {
    expect(trackPosition(0, -500, 10_000)).toEqual({ state: "before" });
    expect(trackPosition(500, -500, 10_000)).toEqual({ state: "play", fileMs: 0 });
    expect(trackPosition(10_400, -500, 10_000)).toEqual({ state: "play", fileMs: 9900 });
  });
});

describe("mixSpan / mixTotalMs", () => {
  it("가장 늦게 끝나는 채널까지", () => {
    expect(mixSpan(-500, 10_000)).toEqual({ startMs: 500, endMs: 10_500 });
    expect(mixTotalMs([{ offsetMs: 0, durationMs: 10_000 }, { offsetMs: -500, durationMs: 10_000 }, { offsetMs: 3000, durationMs: 12_000 }])).toBe(10_500);
  });
});

describe("validateSyncEstimate", () => {
  it("형식 검증", () => {
    expect(validateSyncEstimate({ offsetMs: 120.4, confidence: 0.8 })).toEqual({ offsetMs: 120, confidence: 0.8 });
    expect(validateSyncEstimate({ offsetMs: 120, confidence: 2 })).toBeNull();
    expect(validateSyncEstimate({ offsetMs: 1e9, confidence: 0.5 })).toBeNull();
    expect(validateSyncEstimate(null)).toBeNull();
  });
});

it("formatSyncOffset", () => {
  expect(formatSyncOffset(120)).toBe("+120ms");
  expect(formatSyncOffset(-45)).toBe("−45ms");
  expect(formatSyncOffset(0)).toBe("0ms");
});

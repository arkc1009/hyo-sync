import { describe, expect, it } from "vitest";
import { computePeaks, PEAK_BUCKETS, validatePeaks } from "@/lib/mix/peaks";

describe("computePeaks", () => {
  it("구간별 최대 |진폭| 을 가장 큰 값 기준으로 정규화", () => {
    const data = Float32Array.from([0.1, -0.2, 0.05, 0, -0.5, 0.25, 0, 0]);
    expect(computePeaks([data], 4)).toEqual([0.4, 0.1, 1, 0]);
  });

  it("여러 채널이면 채널 중 큰 값", () => {
    const l = Float32Array.from([0.5, 0, 0, 0]);
    const r = Float32Array.from([0, 0, 0, 0.25]);
    expect(computePeaks([l, r], 2)).toEqual([1, 0.5]);
  });

  it("무음이면 전부 0, 빈 입력이면 빈 배열", () => {
    expect(computePeaks([new Float32Array(10)], 5)).toEqual([0, 0, 0, 0, 0]);
    expect(computePeaks([new Float32Array(0)])).toEqual([]);
  });

  it("샘플이 구간보다 적으면 샘플 수만큼", () => {
    expect(computePeaks([Float32Array.from([1, 0.5])], 10)).toHaveLength(2);
  });

  it("기본 구간 수", () => {
    const data = new Float32Array(16000 * 10).map((_, i) => Math.sin(i / 10));
    const peaks = computePeaks([data]);
    expect(peaks).toHaveLength(PEAK_BUCKETS);
    expect(validatePeaks(peaks)).not.toBeNull();
  });
});

describe("validatePeaks", () => {
  it("0~1 숫자 배열만 통과", () => {
    expect(validatePeaks([0, 0.5, 1])).toEqual([0, 0.5, 1]);
    expect(validatePeaks([])).toBeNull();
    expect(validatePeaks([1.2])).toBeNull();
    expect(validatePeaks([-0.1])).toBeNull();
    expect(validatePeaks(["0.5"])).toBeNull();
    expect(validatePeaks(new Array(PEAK_BUCKETS + 1).fill(0))).toBeNull();
    expect(validatePeaks(null)).toBeNull();
  });
});

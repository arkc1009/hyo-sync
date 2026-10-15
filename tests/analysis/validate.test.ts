import { describe, expect, it } from "vitest";
import { MAX_FRAMES, validatePitchTrack } from "@/lib/analysis/validate";

const good = { hopMs: 10, frames: 3, f0Cents: [6000, null, 6200.5], confidence: [0.9, 0.1, 1] };

describe("validatePitchTrack", () => {
  it("정상 입력", () => {
    const r = validatePitchTrack(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.track.f0Cents[1]).toBeNull();
  });

  it.each([
    ["객체 아님", null],
    ["hopMs 다름", { ...good, hopMs: 20 }],
    ["frames 0", { ...good, frames: 0, f0Cents: [], confidence: [] }],
    ["frames 초과", { ...good, frames: MAX_FRAMES + 1 }],
    ["f0 길이 불일치", { ...good, f0Cents: [6000] }],
    ["confidence 길이 불일치", { ...good, confidence: [1] }],
    ["f0 에 문자열", { ...good, f0Cents: [6000, "x", 6200] }],
    ["f0 에 NaN", { ...good, f0Cents: [6000, NaN, 6200] }],
    ["confidence 범위 밖", { ...good, confidence: [0.9, 1.5, 1] }],
  ])("거부: %s", (_name, input) => {
    expect(validatePitchTrack(input).ok).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { segmentPhrases } from "@/lib/analysis/phrases";
import { HOP, MELODY, makeTrack } from "./fixtures";

describe("segmentPhrases", () => {
  it("400ms 무성 간격으로 4소절을 나눈다", () => {
    const guide = makeTrack({ phrases: MELODY, gapMs: 400 });
    const ph = segmentPhrases(guide);
    expect(ph.map((p) => p.index)).toEqual([0, 1, 2, 3]);
    // 첫 소절 = lead(200ms) 이후 1600ms
    expect(ph[0].startFrame).toBe(200 / HOP);
    expect(ph[0].endFrame).toBe((200 + 1600) / HOP);
  });

  it("phraseGapMs 미만의 짧은 무성은 경계로 보지 않는다", () => {
    const guide = makeTrack({ phrases: MELODY, gapMs: 200 });
    expect(segmentPhrases(guide)).toHaveLength(1);
  });

  it("minPhraseMs 보다 짧은 소절은 앞 소절에 합친다", () => {
    const guide = makeTrack({
      phrases: [[{ midi: 60, ms: 1000 }], [{ midi: 62, ms: 200 }], [{ midi: 64, ms: 1000 }]],
      gapMs: 400,
    });
    const ph = segmentPhrases(guide);
    expect(ph).toHaveLength(2);
    // 0번 소절이 200ms 짜리를 흡수
    expect(ph[0].endFrame - ph[0].startFrame).toBe((1000 + 400 + 200) / HOP);
  });

  it("전부 무성이면 빈 배열", () => {
    const guide = makeTrack({ phrases: [[{ midi: 60, ms: 500 }]], mute: [0] });
    expect(segmentPhrases(guide)).toEqual([]);
  });
});

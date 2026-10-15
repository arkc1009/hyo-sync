import { describe, expect, it } from "vitest";
import { compare, judgePhrase } from "@/lib/analysis/compare";
import { THRESHOLDS, THRESHOLDS_VERSION } from "@/lib/analysis/thresholds";
import { MELODY, makeTrack } from "./fixtures";

const guide = makeTrack({ phrases: MELODY });

describe("judgePhrase", () => {
  it("임계치 경계", () => {
    expect(judgePhrase(0, 0, 1).verdict).toBe("OK");
    expect(judgePhrase(THRESHOLDS.pitchFixableCents, 0, 1)).toEqual({ verdict: "FIXABLE", reasons: ["PITCH_SHARP"] });
    expect(judgePhrase(-THRESHOLDS.pitchRerecordCents, 0, 1)).toEqual({ verdict: "RERECORD", reasons: ["PITCH_FLAT"] });
    expect(judgePhrase(0, THRESHOLDS.timingFixableMs, 1)).toEqual({ verdict: "FIXABLE", reasons: ["TIMING_LATE"] });
    expect(judgePhrase(0, -THRESHOLDS.timingRerecordMs, 1)).toEqual({ verdict: "RERECORD", reasons: ["TIMING_EARLY"] });
    expect(judgePhrase(100, 200, THRESHOLDS.coverageMin - 0.01)).toEqual({ verdict: "UNRELIABLE", reasons: ["LOW_COVERAGE"] });
  });

  it("음정·타이밍 둘 다 나가면 둘 다 사유에, 판정은 최악", () => {
    const r = judgePhrase(30, 150, 1);
    expect(r.verdict).toBe("RERECORD");
    expect(r.reasons).toEqual(["PITCH_SHARP", "TIMING_LATE"]);
  });
});

describe("compare", () => {
  it("(a) 동일 입력 → 전부 OK, 오프셋 0", () => {
    const r = compare(guide, guide);
    expect(r.thresholdsVersion).toBe(THRESHOLDS_VERSION);
    expect(r.phrases).toHaveLength(4);
    expect(r.phrases.every((p) => p.verdict === "OK")).toBe(true);
    expect(r.phrases.every((p) => p.coverage === 1)).toBe(true);
    expect(r.globalOffsetMs).toBe(0);
    expect(r.summary).toEqual({ ok: 4, fixable: 0, rerecord: 0, unreliable: 0, worstPhrases: [] });
  });

  it("(b) 한 소절 +60cent → 그 소절만 RERECORD / PITCH_SHARP", () => {
    const sub = makeTrack({ phrases: MELODY, pitchShift: { 2: 60 } });
    const r = compare(guide, sub);
    expect(r.phrases.map((p) => p.verdict)).toEqual(["OK", "OK", "RERECORD", "OK"]);
    expect(r.phrases[2].reasons).toEqual(["PITCH_SHARP"]);
    expect(r.phrases[2].pitch.medianCents).toBe(60);
    expect(r.summary.rerecord).toBe(1);
    expect(r.summary.worstPhrases).toEqual([2]);
  });

  it("(b') 한 소절 −30cent → FIXABLE / PITCH_FLAT", () => {
    const sub = makeTrack({ phrases: MELODY, pitchShift: { 1: -30 } });
    const r = compare(guide, sub);
    expect(r.phrases[1].verdict).toBe("FIXABLE");
    expect(r.phrases[1].reasons).toEqual(["PITCH_FLAT"]);
  });

  it("(c) 전체 +100ms 시프트 → globalOffsetMs ≈ 100, 모든 소절 TIMING_LATE", () => {
    const sub = makeTrack({ phrases: MELODY, globalShiftMs: 100 });
    const r = compare(guide, sub);
    expect(r.globalOffsetMs).toBeGreaterThanOrEqual(90);
    expect(r.globalOffsetMs).toBeLessThanOrEqual(110);
    expect(r.phrases.every((p) => p.reasons.includes("TIMING_LATE"))).toBe(true);
    // 시프트만 있고 음정은 같으므로 음정 사유는 없음
    expect(r.phrases.every((p) => Math.abs(p.pitch.medianCents) < THRESHOLDS.pitchFixableCents)).toBe(true);
  });

  it("(c') 한 소절만 150ms 늦게 들어오면 그 소절만 RERECORD / TIMING_LATE", () => {
    const sub = makeTrack({ phrases: MELODY, timeShift: { 1: 150 } });
    const r = compare(guide, sub);
    expect(r.phrases[1].verdict).toBe("RERECORD");
    expect(r.phrases[1].reasons).toEqual(["TIMING_LATE"]);
    expect(r.phrases[1].timing.onsetMs).toBeGreaterThanOrEqual(140);
    expect(r.phrases[0].verdict).toBe("OK");
    expect(r.phrases[2].verdict).toBe("OK");
    expect(r.globalOffsetMs).toBe(0);
  });

  it("(d) 한 소절 무성 → UNRELIABLE, 전역 오프셋 계산에서 제외", () => {
    const sub = makeTrack({ phrases: MELODY, mute: [3] });
    const r = compare(guide, sub);
    expect(r.phrases[3].verdict).toBe("UNRELIABLE");
    expect(r.phrases[3].coverage).toBe(0);
    expect(r.summary.unreliable).toBe(1);
    expect(r.globalOffsetMs).toBe(0);
  });

  it("hopMs 가 다르면 거부", () => {
    expect(() => compare(guide, { ...guide, hopMs: 20 })).toThrow(/hopMs/);
  });

  it("4분 길이 입력도 1초 안에 끝난다", () => {
    const long: typeof MELODY = [];
    for (let i = 0; i < 125; i++) long.push(MELODY[i % 4]); // ≈ 240초
    const g = makeTrack({ phrases: long });
    const s = makeTrack({ phrases: long, pitchShift: { 10: 40 }, timeShift: { 20: 80 } });
    expect(g.frames).toBeGreaterThan(20000);
    const t0 = performance.now();
    const r = compare(g, s);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.phrases[10].verdict).toBe("FIXABLE");
    expect(r.phrases[20].verdict).toBe("FIXABLE");
    expect(r.summary.ok).toBe(123);
  });
});

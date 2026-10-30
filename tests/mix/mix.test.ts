import { describe, expect, it } from "vitest";
import { channelGains, COMMENT_MAX_LENGTH, latestTakes, needsResync, validateComment } from "@/lib/mix";

describe("validateComment", () => {
  it("정상 입력은 다듬어서 통과", () => {
    expect(validateComment({ startMs: 1000.4, endMs: 3000.6, body: "  여기 음정  " })).toEqual({
      ok: true,
      value: { startMs: 1000, endMs: 3001, body: "여기 음정" },
    });
  });

  it("시작·끝이 뒤집혀 있으면 바로잡는다", () => {
    const r = validateComment({ startMs: 5000, endMs: 2000, body: "x" });
    expect(r.ok && r.value).toMatchObject({ startMs: 2000, endMs: 5000 });
  });

  it("너무 짧은 구간은 최소 길이로 늘리고, 길이 안으로 자른다", () => {
    const a = validateComment({ startMs: 1000, endMs: 1000, body: "x" });
    expect(a.ok && a.value).toMatchObject({ startMs: 1000, endMs: 1500 });
    const b = validateComment({ startMs: 9900, endMs: 9900, body: "x" }, 10000);
    expect(b.ok && b.value).toMatchObject({ startMs: 9500, endMs: 10000 });
    const c = validateComment({ startMs: -300, endMs: 800, body: "x" });
    expect(c.ok && c.value).toMatchObject({ startMs: 0, endMs: 800 });
  });

  it("빈 내용·너무 긴 내용·숫자 아님은 거절", () => {
    expect(validateComment({ startMs: 0, endMs: 1000, body: "   " }).ok).toBe(false);
    expect(validateComment({ startMs: 0, endMs: 1000, body: "a".repeat(COMMENT_MAX_LENGTH + 1) }).ok).toBe(false);
    expect(validateComment({ startMs: "0", endMs: 1000, body: "x" }).ok).toBe(false);
    expect(validateComment({ startMs: NaN, endMs: 1000, body: "x" }).ok).toBe(false);
    expect(validateComment(null).ok).toBe(false);
  });
});

describe("latestTakes", () => {
  it("파트·멤버별 최신 테이크만 남기고 순서 유지", () => {
    const subs = [
      { id: "a1", partId: "p1", userId: "u1", take: 1 },
      { id: "a2", partId: "p1", userId: "u1", take: 2 },
      { id: "b1", partId: "p1", userId: "u2", take: 1 },
      { id: "c1", partId: "p2", userId: "u1", take: 1 },
    ];
    expect(latestTakes(subs).map((s) => s.id)).toEqual(["a2", "b1", "c1"]);
  });
});

describe("channelGains", () => {
  it("뮤트는 0, 볼륨은 0~1 로 자름", () => {
    expect(channelGains([
      { volume: 0.8, muted: false, solo: false },
      { volume: 1, muted: true, solo: false },
      { volume: 1.5, muted: false, solo: false },
    ])).toEqual([0.8, 0, 1]);
  });

  it("솔로가 있으면 솔로 채널만 (뮤트돼 있어도 솔로면 들림)", () => {
    expect(channelGains([
      { volume: 0.5, muted: false, solo: false },
      { volume: 0.7, muted: true, solo: true },
      { volume: 1, muted: false, solo: true },
    ])).toEqual([0, 0.7, 1]);
  });
});

describe("needsResync", () => {
  it("50ms 넘게 벌어지면 true, 트랙이 끝났으면 false", () => {
    expect(needsResync(10, 10.03, 60)).toBe(false);
    expect(needsResync(10, 10.08, 60)).toBe(true);
    expect(needsResync(70, 60, 60)).toBe(false);
  });
});

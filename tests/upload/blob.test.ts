import { describe, expect, it } from "vitest";
import { audioSrc } from "@/lib/blob";

describe("audioSrc", () => {
  it("blobUrl 을 쿼리로 인코딩한 프록시 경로", () => {
    const url = "https://abc.private.blob.vercel-storage.com/guides/p1/1.wav";
    const src = audioSrc(url);
    expect(src.startsWith("/api/blob/audio?url=")).toBe(true);
    expect(new URL(src, "http://x").searchParams.get("url")).toBe(url);
  });
});

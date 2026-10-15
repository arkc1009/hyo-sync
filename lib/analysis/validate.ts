import type { PitchTrack } from "./types";

/** 10분 = 60,000 프레임. 그 이상은 거부 */
export const MAX_FRAMES = 60_000;
export const EXPECTED_HOP_MS = 10;

/** 클라이언트가 보낸 JSON 이 PitchTrack 인지. 실패 사유를 문자열로 */
export function validatePitchTrack(x: unknown): { ok: true; track: PitchTrack } | { ok: false; error: string } {
  if (typeof x !== "object" || x === null) return { ok: false, error: "객체가 아님" };
  const o = x as Record<string, unknown>;
  if (o.hopMs !== EXPECTED_HOP_MS) return { ok: false, error: `hopMs 는 ${EXPECTED_HOP_MS} 이어야 함` };
  const frames = o.frames;
  if (typeof frames !== "number" || !Number.isInteger(frames) || frames <= 0 || frames > MAX_FRAMES) {
    return { ok: false, error: `frames 는 1~${MAX_FRAMES} 정수` };
  }
  const f0 = o.f0Cents;
  const conf = o.confidence;
  if (!Array.isArray(f0) || f0.length !== frames) return { ok: false, error: "f0Cents 길이가 frames 와 다름" };
  if (!Array.isArray(conf) || conf.length !== frames) return { ok: false, error: "confidence 길이가 frames 와 다름" };
  for (let i = 0; i < frames; i++) {
    const c = f0[i];
    if (c !== null && (typeof c !== "number" || !Number.isFinite(c))) return { ok: false, error: `f0Cents[${i}] 가 숫자/null 이 아님` };
    const k = conf[i];
    if (typeof k !== "number" || !(k >= 0 && k <= 1)) return { ok: false, error: `confidence[${i}] 가 0~1 이 아님` };
  }
  return { ok: true, track: { hopMs: EXPECTED_HOP_MS, frames, f0Cents: f0 as (number | null)[], confidence: conf as number[] } };
}

import { SEGMENTATION } from "./thresholds";
import type { Phrase, PitchTrack } from "./types";

/**
 * 가이드 PitchTrack 을 소절로 자른다.
 * 무성 구간이 phraseGapMs 이상이면 경계. minPhraseMs 보다 짧은 소절은 앞 소절에 합친다.
 * 소절 구간은 유성 프레임의 첫/끝 (가운데 짧은 무성은 포함).
 */
export function segmentPhrases(
  guide: PitchTrack,
  opts: { phraseGapMs?: number; minPhraseMs?: number } = {},
): Phrase[] {
  const gapFrames = Math.round((opts.phraseGapMs ?? SEGMENTATION.phraseGapMs) / guide.hopMs);
  const minFrames = Math.round((opts.minPhraseMs ?? SEGMENTATION.minPhraseMs) / guide.hopMs);

  const raw: Array<{ startFrame: number; endFrame: number }> = [];
  let start = -1;
  let lastVoiced = -1;
  for (let i = 0; i < guide.frames; i++) {
    const voiced = guide.f0Cents[i] != null;
    if (!voiced) continue;
    if (start < 0) {
      start = i;
    } else if (i - lastVoiced > gapFrames) {
      raw.push({ startFrame: start, endFrame: lastVoiced + 1 });
      start = i;
    }
    lastVoiced = i;
  }
  if (start >= 0) raw.push({ startFrame: start, endFrame: lastVoiced + 1 });

  // 짧은 소절은 앞 소절에 병합 (첫 소절이 짧으면 뒤 소절과 합친다)
  const merged: Array<{ startFrame: number; endFrame: number }> = [];
  for (const p of raw) {
    const prev = merged[merged.length - 1];
    const short = p.endFrame - p.startFrame < minFrames;
    if (prev && (short || prev.endFrame - prev.startFrame < minFrames)) {
      prev.endFrame = p.endFrame;
    } else {
      merged.push({ ...p });
    }
  }

  return merged.map((p, index) => ({ index, ...p }));
}

import { dtw } from "./dtw";
import { segmentPhrases } from "./phrases";
import { DTW, THRESHOLDS, THRESHOLDS_VERSION } from "./thresholds";
import type { PhraseResult, PitchTrack, Reason, Report, ReportSummary, Verdict } from "./types";

const VERDICT_RANK: Record<Verdict, number> = { OK: 0, UNRELIABLE: 1, FIXABLE: 2, RERECORD: 3 };

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 소절 하나의 판정. 순수 함수 — 테스트에서 직접 호출 가능 */
export function judgePhrase(
  pitchMedianCents: number,
  timingOnsetMs: number,
  coverage: number,
): { verdict: Verdict; reasons: Reason[] } {
  if (coverage < THRESHOLDS.coverageMin) return { verdict: "UNRELIABLE", reasons: ["LOW_COVERAGE"] };
  const reasons: Reason[] = [];
  let verdict: Verdict = "OK";
  const bump = (v: Verdict) => { if (VERDICT_RANK[v] > VERDICT_RANK[verdict]) verdict = v; };

  const p = Math.abs(pitchMedianCents);
  if (p >= THRESHOLDS.pitchFixableCents) {
    reasons.push(pitchMedianCents > 0 ? "PITCH_SHARP" : "PITCH_FLAT");
    bump(p >= THRESHOLDS.pitchRerecordCents ? "RERECORD" : "FIXABLE");
  }
  const t = Math.abs(timingOnsetMs);
  if (t >= THRESHOLDS.timingFixableMs) {
    reasons.push(timingOnsetMs > 0 ? "TIMING_LATE" : "TIMING_EARLY");
    bump(t >= THRESHOLDS.timingRerecordMs ? "RERECORD" : "FIXABLE");
  }
  return { verdict, reasons };
}

/**
 * 가이드 vs 녹음본. 두 트랙의 hopMs 는 같아야 한다.
 * SPEC "파이프라인 C" 참고.
 */
export function compare(guide: PitchTrack, sub: PitchTrack): Report {
  if (guide.hopMs !== sub.hopMs) throw new Error(`hopMs 불일치: guide ${guide.hopMs}, sub ${sub.hopMs}`);
  const hop = guide.hopMs;
  const band = Math.round(DTW.bandMs / hop);
  const path = dtw(guide.f0Cents, sub.f0Cents, band, DTW.unvoicedPenaltyCents);
  const phrases = segmentPhrases(guide);

  const results: PhraseResult[] = phrases.map((ph) => {
    const diffs: number[] = [];
    const offsets: number[] = [];
    let guideVoiced = 0;
    let both = 0;
    for (let g = ph.startFrame; g < ph.endFrame; g++) {
      const gc = guide.f0Cents[g];
      if (gc == null) continue;
      guideVoiced++;
      const s = path.guideToSub[g];
      const sc = sub.f0Cents[s];
      if (sc == null) continue;
      both++;
      diffs.push(sc - gc);
      offsets.push((s - g) * hop);
    }
    const subStart = path.guideToSub[ph.startFrame];
    const subEnd = path.guideToSub[ph.endFrame - 1] + 1;
    const pitchMedian = median(diffs);
    const meanAbs = diffs.length ? diffs.reduce((a, d) => a + Math.abs(d), 0) / diffs.length : 0;
    const onsetMs = (subStart - ph.startFrame) * hop;
    const coverage = guideVoiced ? both / guideVoiced : 0;
    const { verdict, reasons } = judgePhrase(pitchMedian, onsetMs, coverage);
    return {
      index: ph.index,
      guideStartMs: ph.startFrame * hop,
      guideEndMs: ph.endFrame * hop,
      subStartMs: subStart * hop,
      subEndMs: subEnd * hop,
      pitch: { medianCents: round1(pitchMedian), meanAbsCents: round1(meanAbs) },
      timing: { onsetMs: Math.round(onsetMs), medianMs: Math.round(median(offsets)) },
      coverage: round3(coverage),
      verdict,
      reasons,
    };
  });

  const globalOffsetMs = Math.round(median(results.filter((r) => r.verdict !== "UNRELIABLE").map((r) => r.timing.onsetMs)));

  const summary: ReportSummary = {
    ok: results.filter((r) => r.verdict === "OK").length,
    fixable: results.filter((r) => r.verdict === "FIXABLE").length,
    rerecord: results.filter((r) => r.verdict === "RERECORD").length,
    unreliable: results.filter((r) => r.verdict === "UNRELIABLE").length,
    worstPhrases: [...results]
      .filter((r) => r.verdict === "FIXABLE" || r.verdict === "RERECORD")
      .sort((a, b) => severity(b) - severity(a))
      .slice(0, 3)
      .map((r) => r.index),
  };

  return { thresholdsVersion: THRESHOLDS_VERSION, globalOffsetMs, summary, phrases: results };
}

/** 정렬용 심각도: 판정 등급 우선, 같은 등급이면 임계치 대비 비율 */
function severity(r: PhraseResult): number {
  return (
    VERDICT_RANK[r.verdict] * 1000 +
    Math.abs(r.pitch.medianCents) / THRESHOLDS.pitchRerecordCents +
    Math.abs(r.timing.onsetMs) / THRESHOLDS.timingRerecordMs
  );
}

const round1 = (x: number) => Math.round(x * 10) / 10;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

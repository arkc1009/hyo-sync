import { compare } from "@/lib/analysis/compare";
import type { PitchTrack } from "@/lib/analysis/types";
import { prisma } from "@/lib/db";

/**
 * 녹음본 피치를 syncOffsetMs 만큼 옮겨 가이드와 compare() → Report 저장(있으면 덮어씀) + ANALYZED.
 * 실패하면 FAILED 로 두고 false
 */
export async function saveReport(submissionId: string, guide: { id: string; pitch: unknown }, pitch: PitchTrack, syncOffsetMs: number) {
  try {
    const report = compare(guide.pitch as PitchTrack, pitch, syncOffsetMs);
    const data = {
      guideTrackId: guide.id,
      thresholdsVersion: report.thresholdsVersion,
      globalOffsetMs: report.globalOffsetMs,
      summary: { ...report.summary },
      phrases: report.phrases.map((p) => ({ ...p })),
    };
    await prisma.$transaction([
      prisma.report.upsert({ where: { submissionId }, create: { submissionId, ...data }, update: data }),
      prisma.submission.update({ where: { id: submissionId }, data: { status: "ANALYZED" } }),
    ]);
    return true;
  } catch (e) {
    console.error("compare 실패", submissionId, e);
    await prisma.submission.update({ where: { id: submissionId }, data: { status: "FAILED" } });
    return false;
  }
}

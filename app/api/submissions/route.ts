import { NextResponse } from "next/server";
import { partForUser } from "@/lib/access";
import { compare } from "@/lib/analysis/compare";
import type { PitchTrack } from "@/lib/analysis/types";
import { validatePitchTrack } from "@/lib/analysis/validate";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

// body: { partId, blobUrl, durationMs, pitch: PitchTrack }
// 제출을 만들고 그 자리에서 파트의 최신 가이드와 compare() → Report 저장
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { partId?: unknown; blobUrl?: unknown; durationMs?: unknown; pitch?: unknown }
    | null;
  if (!body || typeof body.partId !== "string" || typeof body.blobUrl !== "string" || typeof body.durationMs !== "number") {
    return NextResponse.json({ error: "partId / blobUrl / durationMs 필요" }, { status: 400 });
  }
  const v = validatePitchTrack(body.pitch);
  if (!v.ok) return NextResponse.json({ error: `pitch: ${v.error}` }, { status: 400 });

  const part = await partForUser(body.partId, user.id);
  if (!part) return NextResponse.json({ error: "파트 접근 권한 없음" }, { status: 403 });

  const guide = await prisma.guideTrack.findFirst({ where: { partId: part.id }, orderBy: { createdAt: "desc" } });
  if (!guide) return NextResponse.json({ error: "이 파트에 가이드가 아직 없어요. 담당자가 먼저 올려야 해요" }, { status: 409 });

  const takeCount = await prisma.submission.count({ where: { partId: part.id, userId: user.id } });
  const submission = await prisma.submission.create({
    data: {
      partId: part.id,
      userId: user.id,
      blobUrl: body.blobUrl,
      durationMs: Math.round(body.durationMs),
      take: takeCount + 1,
      pitch: { ...v.track },
    },
    select: { id: true },
  });

  try {
    const report = compare(guide.pitch as unknown as PitchTrack, v.track);
    await prisma.$transaction([
      prisma.report.create({
        data: {
          submissionId: submission.id,
          guideTrackId: guide.id,
          thresholdsVersion: report.thresholdsVersion,
          globalOffsetMs: report.globalOffsetMs,
          summary: { ...report.summary },
          phrases: report.phrases.map((p) => ({ ...p })),
        },
      }),
      prisma.submission.update({ where: { id: submission.id }, data: { status: "ANALYZED" } }),
    ]);
  } catch (e) {
    console.error("compare 실패", submission.id, e);
    await prisma.submission.update({ where: { id: submission.id }, data: { status: "FAILED" } });
    return NextResponse.json({ id: submission.id, error: "분석 실패" }, { status: 500 });
  }

  return NextResponse.json({ id: submission.id }, { status: 201 });
}

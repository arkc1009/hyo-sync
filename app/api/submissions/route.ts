import { NextResponse } from "next/server";
import { partForUser } from "@/lib/access";
import { estimateOffsetFromPitch, isConfident } from "@/lib/analysis/sync";
import type { PitchTrack } from "@/lib/analysis/types";
import { validatePitchTrack } from "@/lib/analysis/validate";
import { prisma } from "@/lib/db";
import { validatePeaks } from "@/lib/mix/peaks";
import { validateSyncEstimate } from "@/lib/mix/sync";
import { saveReport } from "@/lib/report";
import { currentUser } from "@/lib/session";

// body: { partId, blobUrl, durationMs, pitch: PitchTrack, peaks? } | { partId, blobUrl, durationMs, mixOnly: true, peaks?, sync? }
// peaks 는 믹서 파형용 (lib/mix/peaks.ts). 없거나 형식이 틀리면 저장 안 함
// 제출을 만들고 그 자리에서 파트의 최신 가이드와 피치 곡선으로 시작 싱크를 찾고(lib/analysis/sync.ts), 맞춘 뒤 compare() → Report 저장.
// mixOnly 면 가이드 비교 없이 믹서·피드백용 트랙으로만 저장 (pitch 없음, 가이드 없어도 됨).
//   sync = { offsetMs, confidence }: 브라우저가 가이드와 에너지 엔벨로프로 찾은 시작 싱크. 신뢰도가 낮으면 적용 안 함
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { partId?: unknown; blobUrl?: unknown; durationMs?: unknown; pitch?: unknown; mixOnly?: unknown; peaks?: unknown }
    | null;
  if (!body || typeof body.partId !== "string" || typeof body.blobUrl !== "string" || typeof body.durationMs !== "number" || !(body.durationMs > 0)) {
    return NextResponse.json({ error: "partId / blobUrl / durationMs 필요" }, { status: 400 });
  }
  const peaks = validatePeaks(body.peaks) ?? undefined;

  if (body.mixOnly === true) {
    const part = await partForUser(body.partId, user.id);
    if (!part) return NextResponse.json({ error: "파트 접근 권한 없음" }, { status: 403 });
    const takeCount = await prisma.submission.count({ where: { partId: part.id, userId: user.id } });
    const sync = validateSyncEstimate((body as { sync?: unknown }).sync);
    const applied = sync && isConfident(sync) ? sync.offsetMs : null;
    const submission = await prisma.submission.create({
      data: {
        partId: part.id, userId: user.id, blobUrl: body.blobUrl, durationMs: Math.round(body.durationMs), take: takeCount + 1, status: "MIX_ONLY", peaks,
        ...(sync && { syncOffsetMs: applied ?? 0, syncAutoMs: applied, syncConfidence: sync.confidence }),
      },
      select: { id: true },
    });
    return NextResponse.json({ id: submission.id }, { status: 201 });
  }

  const v = validatePitchTrack(body.pitch);
  if (!v.ok) return NextResponse.json({ error: `pitch: ${v.error}` }, { status: 400 });

  const part = await partForUser(body.partId, user.id);
  if (!part) return NextResponse.json({ error: "파트 접근 권한 없음" }, { status: 403 });

  const guide = await prisma.guideTrack.findFirst({ where: { partId: part.id }, orderBy: { createdAt: "desc" } });
  if (!guide) return NextResponse.json({ error: "이 파트에 가이드가 아직 없어요. 담당자가 먼저 올려야 해요" }, { status: 409 });

  // 시작 싱크: 피치 곡선으로 찾고, 믿을 만하면 적용. 실패해도 제출은 계속 (오프셋 0)
  let sync: { offsetMs: number; confidence: number } | null = null;
  try {
    sync = estimateOffsetFromPitch(guide.pitch as unknown as PitchTrack, v.track);
  } catch (e) {
    console.error("싱크 추정 실패", e);
  }
  const applied = sync && isConfident(sync) ? sync.offsetMs : null;

  const takeCount = await prisma.submission.count({ where: { partId: part.id, userId: user.id } });
  const submission = await prisma.submission.create({
    data: {
      partId: part.id,
      userId: user.id,
      blobUrl: body.blobUrl,
      durationMs: Math.round(body.durationMs),
      take: takeCount + 1,
      pitch: { ...v.track },
      peaks,
      syncOffsetMs: applied ?? 0,
      syncAutoMs: applied,
      syncConfidence: sync?.confidence ?? null,
    },
    select: { id: true },
  });

  if (!(await saveReport(submission.id, guide, v.track, applied ?? 0))) {
    return NextResponse.json({ id: submission.id, error: "분석 실패" }, { status: 500 });
  }

  return NextResponse.json({ id: submission.id }, { status: 201 });
}

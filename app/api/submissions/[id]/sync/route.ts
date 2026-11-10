import { NextResponse } from "next/server";
import { estimateOffsetFromPitch, isConfident, validateOffsetMs } from "@/lib/analysis/sync";
import { SYNC } from "@/lib/analysis/thresholds";
import type { PitchTrack } from "@/lib/analysis/types";
import { prisma } from "@/lib/db";
import { validateSyncEstimate } from "@/lib/mix/sync";
import { saveReport } from "@/lib/report";
import { currentUser } from "@/lib/session";

// 녹음본 시작 싱크 바꾸기. 담당자 또는 녹음본 주인만.
// body:
//   { offsetMs }                  직접 조정
//   { detect: true }              서버에서 피치 곡선으로 다시 찾기 (가이드 비교 제출만)
//   { estimate: { offsetMs, confidence } }  브라우저가 에너지 엔벨로프로 찾은 값 (믹스용 트랙)
// 피치가 있는 제출이면 바뀐 오프셋으로 리포트를 다시 계산한다
export async function PATCH(req: Request, ctx: RouteContext<"/api/submissions/[id]/sync">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { id } = await ctx.params;

  const sub = await prisma.submission.findFirst({
    where: { id, OR: [{ userId: user.id }, { part: { project: { ownerId: user.id } } }] },
    select: { id: true, partId: true, pitch: true, report: { select: { guideTrack: { select: { id: true, pitch: true } } } } },
  });
  if (!sub) return NextResponse.json({ error: "싱크는 담당자나 본인만 바꿀 수 있어요" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { offsetMs?: unknown; detect?: unknown; estimate?: unknown } | null;
  if (!body) return NextResponse.json({ error: "본문 형식 오류" }, { status: 400 });

  const pitch = sub.pitch as unknown as PitchTrack | null;
  const guide = sub.report?.guideTrack
    ?? (pitch ? await prisma.guideTrack.findFirst({ where: { partId: sub.partId }, orderBy: { createdAt: "desc" }, select: { id: true, pitch: true } }) : null);

  let data: { syncOffsetMs: number; syncAutoMs?: number | null; syncConfidence?: number };
  if (body.detect === true) {
    if (!pitch || !guide) return NextResponse.json({ error: "피치 곡선이 없어 서버에서 찾을 수 없어요" }, { status: 409 });
    const e = estimateOffsetFromPitch(guide.pitch as unknown as PitchTrack, pitch);
    if (!isConfident(e)) {
      await prisma.submission.update({ where: { id }, data: { syncAutoMs: null, syncConfidence: e.confidence } });
      return NextResponse.json({ error: "자동으로 맞출 지점을 찾지 못했어요. 직접 조정해 주세요", confidence: e.confidence }, { status: 422 });
    }
    data = { syncOffsetMs: e.offsetMs, syncAutoMs: e.offsetMs, syncConfidence: e.confidence };
  } else if (body.estimate !== undefined) {
    const e = validateSyncEstimate(body.estimate);
    if (!e) return NextResponse.json({ error: "estimate 형식 오류" }, { status: 400 });
    if (!isConfident(e)) {
      await prisma.submission.update({ where: { id }, data: { syncAutoMs: null, syncConfidence: e.confidence } });
      return NextResponse.json({ error: "자동으로 맞출 지점을 찾지 못했어요. 직접 조정해 주세요", confidence: e.confidence }, { status: 422 });
    }
    data = { syncOffsetMs: e.offsetMs, syncAutoMs: e.offsetMs, syncConfidence: e.confidence };
  } else {
    const offsetMs = validateOffsetMs(body.offsetMs);
    if (offsetMs == null) return NextResponse.json({ error: `offsetMs 는 ±${SYNC.maxOffsetMs / 1000}초 안의 숫자` }, { status: 400 });
    data = { syncOffsetMs: offsetMs };
  }

  const updated = await prisma.submission.update({
    where: { id },
    data,
    select: { syncOffsetMs: true, syncAutoMs: true, syncConfidence: true },
  });
  if (pitch && guide) await saveReport(id, guide, pitch, updated.syncOffsetMs);
  return NextResponse.json(updated);
}

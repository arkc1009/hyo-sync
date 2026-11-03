import { NextResponse } from "next/server";
import { submissionVisibleTo } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { validatePeaks } from "@/lib/mix/peaks";
import { currentUser } from "@/lib/session";

// 피크가 없는 옛 트랙의 파형 채우기. body: { blobUrl, peaks }
// 볼 수 있는 녹음본·가이드·INST 이고 아직 피크가 없을 때만 저장한다 (이미 있으면 덮어쓰지 않음)
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { blobUrl?: unknown; peaks?: unknown } | null;
  const peaks = validatePeaks(body?.peaks);
  if (!body || typeof body.blobUrl !== "string" || !peaks) return NextResponse.json({ error: "blobUrl / peaks 필요" }, { status: 400 });

  const empty = { equals: Prisma.DbNull };
  const inProject = { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
  const [subs, guides, insts] = await Promise.all([
    prisma.submission.updateMany({ where: { blobUrl: body.blobUrl, peaks: empty, ...submissionVisibleTo(user.id) }, data: { peaks } }),
    prisma.guideTrack.updateMany({ where: { blobUrl: body.blobUrl, peaks: empty, part: { project: inProject } }, data: { peaks } }),
    prisma.instrumental.updateMany({ where: { blobUrl: body.blobUrl, peaks: empty, project: inProject }, data: { peaks } }),
  ]);
  return NextResponse.json({ updated: subs.count + guides.count + insts.count });
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateComment } from "@/lib/mix";
import { currentUser } from "@/lib/session";

// 녹음본 구간 코멘트 작성. 담당자만. body: { startMs, endMs, body }
export async function POST(req: Request, ctx: RouteContext<"/api/submissions/[id]/comments">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { id } = await ctx.params;

  const sub = await prisma.submission.findFirst({
    where: { id, part: { project: { ownerId: user.id } } },
    select: { id: true, durationMs: true },
  });
  if (!sub) return NextResponse.json({ error: "코멘트는 담당자만 남길 수 있어요" }, { status: 403 });

  const v = validateComment(await req.json().catch(() => null), sub.durationMs);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const comment = await prisma.trackComment.create({
    data: { submissionId: sub.id, authorId: user.id, ...v.value },
    select: { id: true, submissionId: true, startMs: true, endMs: true, body: true, createdAt: true },
  });
  return NextResponse.json(comment, { status: 201 });
}

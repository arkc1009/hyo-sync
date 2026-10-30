import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

// 구간 코멘트 삭제. 프로젝트 담당자만
export async function DELETE(_req: Request, ctx: RouteContext<"/api/comments/[id]">) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const { id } = await ctx.params;

  const { count } = await prisma.trackComment.deleteMany({
    where: { id, submission: { part: { project: { ownerId: user.id } } } },
  });
  if (count === 0) return NextResponse.json({ error: "삭제 권한 없음" }, { status: 403 });
  return new NextResponse(null, { status: 204 });
}

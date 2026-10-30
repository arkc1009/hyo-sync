import { NextResponse } from "next/server";
import { projectForUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

// body: { projectId, blobUrl, durationMs }. 오디오는 Blob client upload 로 먼저 올라가 있다
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { projectId?: unknown; blobUrl?: unknown; durationMs?: unknown }
    | null;
  if (!body || typeof body.projectId !== "string" || typeof body.blobUrl !== "string" || typeof body.durationMs !== "number" || !(body.durationMs > 0)) {
    return NextResponse.json({ error: "projectId / blobUrl / durationMs 필요" }, { status: 400 });
  }

  const project = await projectForUser(body.projectId, user.id);
  if (!project) return NextResponse.json({ error: "프로젝트 접근 권한 없음" }, { status: 403 });
  if (project.ownerId !== user.id) return NextResponse.json({ error: "INST 는 담당자만 올릴 수 있음" }, { status: 403 });

  const inst = await prisma.instrumental.create({
    data: { projectId: project.id, blobUrl: body.blobUrl, durationMs: Math.round(body.durationMs), uploadedById: user.id },
    select: { id: true },
  });
  return NextResponse.json({ id: inst.id }, { status: 201 });
}

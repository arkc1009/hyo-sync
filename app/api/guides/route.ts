import { NextResponse } from "next/server";
import { partForUser } from "@/lib/access";
import { validatePitchTrack } from "@/lib/analysis/validate";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

// body: { partId, blobUrl, durationMs, pitch: PitchTrack }
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
  if (part.project.ownerId !== user.id) return NextResponse.json({ error: "가이드는 담당자만 올릴 수 있음" }, { status: 403 });

  const guide = await prisma.guideTrack.create({
    data: {
      partId: part.id,
      blobUrl: body.blobUrl,
      durationMs: Math.round(body.durationMs),
      // PitchTrack 은 인터페이스라 Prisma 의 InputJsonValue 인덱스 시그니처와 안 맞는다. 구조는 JSON 호환
      pitch: { ...v.track },
      uploadedById: user.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: guide.id }, { status: 201 });
}

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { partForUser } from "@/lib/access";
import { currentUser } from "@/lib/session";

// Vercel Blob client upload 토큰 발급. 오디오는 API 바디로 받지 않는다 (CLAUDE.md, 4.5MB 한도)
// clientPayload: { kind: "guide" | "submission", partId }
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        if (!payload) throw new Error("clientPayload 형식 오류");
        const part = await partForUser(payload.partId, user.id);
        if (!part) throw new Error("파트 접근 권한 없음");
        if (payload.kind === "guide" && part.project.ownerId !== user.id) throw new Error("가이드는 담당자만 올릴 수 있음");
        return {
          allowedContentTypes: ["audio/*", "video/mp4", "application/octet-stream"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, ...payload }),
        };
      },
      // onUploadCompleted 는 두지 않는다. 있으면 토큰에 callbackUrl 이 실려 Blob 이 이 배포로 웹훅을 보내는데,
      // DB 행은 클라이언트가 /api/guides 로 따로 만들어 필요 없고 프리뷰(배포 보호)·로컬에선 웹훅이 닿지도 않는다
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

function parsePayload(raw: string | null): { kind: "guide" | "submission"; partId: string } | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { kind?: unknown; partId?: unknown };
    if ((p.kind === "guide" || p.kind === "submission") && typeof p.partId === "string") return { kind: p.kind, partId: p.partId };
  } catch {
    /* fallthrough */
  }
  return null;
}

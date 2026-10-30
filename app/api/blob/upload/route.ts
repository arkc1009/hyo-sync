import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { partForUser, projectForUser } from "@/lib/access";
import { currentUser } from "@/lib/session";

// Vercel Blob client upload 토큰 발급. 오디오는 API 바디로 받지 않는다 (CLAUDE.md, 4.5MB 한도)
// clientPayload: { kind: "guide" | "submission", partId } | { kind: "inst", projectId }
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
        if (payload.kind === "inst") {
          const project = await projectForUser(payload.projectId, user.id);
          if (!project) throw new Error("프로젝트 접근 권한 없음");
          if (project.ownerId !== user.id) throw new Error("INST 는 담당자만 올릴 수 있음");
        } else {
          const part = await partForUser(payload.partId, user.id);
          if (!part) throw new Error("파트 접근 권한 없음");
          if (payload.kind === "guide" && part.project.ownerId !== user.id) throw new Error("가이드는 담당자만 올릴 수 있음");
        }
        return {
          allowedContentTypes: ["audio/*", "video/mp4", "application/octet-stream"],
          maximumSizeInBytes: 200 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id, ...payload }),
        };
      },
      // 업로드 완료 웹훅. DB 행은 클라이언트가 /api/guides 로 따로 만든다 (로컬에선 웹훅이 안 오므로)
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

type Payload = { kind: "guide" | "submission"; partId: string } | { kind: "inst"; projectId: string };

function parsePayload(raw: string | null): Payload | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { kind?: unknown; partId?: unknown; projectId?: unknown };
    if ((p.kind === "guide" || p.kind === "submission") && typeof p.partId === "string") return { kind: p.kind, partId: p.partId };
    if (p.kind === "inst" && typeof p.projectId === "string") return { kind: "inst", projectId: p.projectId };
  } catch {
    /* fallthrough */
  }
  return null;
}

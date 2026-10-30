import { get, issueSignedToken, presignUrl } from "@vercel/blob";
import { NextResponse } from "next/server";
import { submissionVisibleTo } from "@/lib/access";
import { BLOB_ACCESS } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/session";

// private Blob 오디오 재생. GET /api/blob/audio?url=<blobUrl>
// 가이드·녹음본·INST 행이 있고 그 프로젝트에 접근 가능한 사용자만 (녹음본은 열람 범위까지).
// 권한 확인 후 1시간짜리 서명 URL 로 302 리다이렉트해 브라우저가 Blob CDN 에서 바로 받는다 (함수를 거쳐 스트리밍하면 느림).
// 서명 URL 발급이 실패하면 Range 를 넘기는 프록시 스트리밍으로 대신한다
const SIGNED_URL_TTL_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "url 필요" }, { status: 400 });

  const inProject = { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
  // 녹음본은 프로젝트 열람 범위(OWN_ONLY)까지 따른다
  const [guide, submission, inst] = await Promise.all([
    prisma.guideTrack.findFirst({ where: { blobUrl: url, part: { project: inProject } }, select: { id: true } }),
    prisma.submission.findFirst({ where: { blobUrl: url, ...submissionVisibleTo(user.id) }, select: { id: true } }),
    prisma.instrumental.findFirst({ where: { blobUrl: url, project: inProject }, select: { id: true } }),
  ]);
  if (!guide && !submission && !inst) return NextResponse.json({ error: "없거나 접근 권한 없음" }, { status: 404 });

  try {
    const pathname = decodeURIComponent(new URL(url).pathname.slice(1));
    const validUntil = Date.now() + SIGNED_URL_TTL_MS;
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access: BLOB_ACCESS });
    return new Response(null, {
      status: 302,
      // 서명 URL 만료보다 짧게 캐시
      headers: { location: presignedUrl, "cache-control": "private, max-age=3000" },
    });
  } catch (e) {
    console.warn("서명 URL 발급 실패, 프록시로 대체", e);
  }

  const range = req.headers.get("range");
  const blob = await get(url, { access: BLOB_ACCESS, headers: range ? { range } : undefined });
  if (!blob || blob.statusCode !== 200) return NextResponse.json({ error: "Blob 없음" }, { status: 404 });

  const headers = new Headers({ "cache-control": "private, max-age=3600", "accept-ranges": "bytes" });
  for (const key of ["content-type", "content-length", "content-range", "etag", "last-modified"]) {
    const value = blob.headers.get(key);
    if (value) headers.set(key, value);
  }
  return new Response(blob.stream, { status: headers.has("content-range") ? 206 : 200, headers });
}

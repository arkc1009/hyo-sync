// Blob 스토어는 private 이라 업로드는 access "private" 로, 재생은 권한을 확인하는 프록시 라우트를 거친다.
// 클라이언트·서버 양쪽에서 import 하므로 외부 의존성 없이 둔다
export const BLOB_ACCESS = "private" as const;

/** DB 에 저장된 blobUrl → <audio src> 에 넣을 재생 경로 (/api/blob/audio) */
export function audioSrc(blobUrl: string) {
  return `/api/blob/audio?${new URLSearchParams({ url: blobUrl })}`;
}

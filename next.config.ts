import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 페이지가 세션(cookies)에 의존하는 동적 페이지라 cacheComponents 는 쓰지 않는다
  // COOP/COEP(wasm 스레드용)는 Blob 오디오·Google 아바타 같은 교차 출처 리소스를 막으므로 걸지 않는다.
  // 기본 백엔드는 webgl 이고 wasm 은 단일 스레드 폴백 (spike/README.md)
  env: {
    // @vercel/blob 은 CORS 없는 에러 응답을 네트워크 에러로 보고 기본 10회 재시도한다 (파일 전체 재업로드).
    // 브라우저 번들에도 인라인되도록 여기서 1회로 줄인다
    VERCEL_BLOB_RETRIES: "1",
  },
};

export default nextConfig;

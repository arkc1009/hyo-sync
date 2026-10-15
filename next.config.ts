import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 페이지가 세션(cookies)에 의존하는 동적 페이지라 cacheComponents 는 쓰지 않는다
  // COOP/COEP(wasm 스레드용)는 Blob 오디오·Google 아바타 같은 교차 출처 리소스를 막으므로 걸지 않는다.
  // 기본 백엔드는 webgl 이고 wasm 은 단일 스레드 폴백 (spike/README.md)
};

export default nextConfig;

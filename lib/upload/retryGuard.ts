// @vercel/blob 클라이언트는 CORS 헤더 없는 에러 응답을 네트워크 에러로 보고 같은 파일을 최대 10회 다시 올린다.
// 진행률(loaded)이 뒤로 가면 재시도가 시작된 것이므로 시도 횟수를 세서 상한을 넘으면 중단 신호를 준다
export const MAX_UPLOAD_ATTEMPTS = 2;

export interface RetryGuard {
  /** XHR 진행 바이트를 넣으면 현재 시도 번호(1부터)를 돌려준다. 상한을 넘으면 null */
  onProgress(loaded: number): number | null;
}

export function createRetryGuard(maxAttempts = MAX_UPLOAD_ATTEMPTS): RetryGuard {
  let attempt = 1;
  let last = 0;
  return {
    onProgress(loaded) {
      if (loaded < last) attempt += 1;
      last = loaded;
      return attempt > maxAttempts ? null : attempt;
    },
  };
}

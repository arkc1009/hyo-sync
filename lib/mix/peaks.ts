// 믹서 파형용 피크. 순수 함수 (DOM·DB 접근 없음, vitest 로 테스트)

/** 트랙 하나를 이 개수의 구간으로 나눠 구간별 최대 진폭을 저장한다. 4분 곡이면 구간당 약 0.24초 */
export const PEAK_BUCKETS = 1000;

/**
 * 채널별 샘플 → 구간별 최대 |진폭| (0~1, 가장 큰 값을 1로 정규화, 소수 셋째 자리).
 * 녹음 크기가 달라도 파형 모양이 보이도록 트랙마다 정규화한다
 */
export function computePeaks(channels: Float32Array[], buckets = PEAK_BUCKETS): number[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0 || buckets <= 0) return [];
  const n = Math.min(buckets, length);
  const peaks = new Array<number>(n).fill(0);
  for (const data of channels) {
    for (let b = 0; b < n; b++) {
      const start = Math.floor((b * length) / n);
      const end = Math.floor(((b + 1) * length) / n);
      let max = peaks[b];
      for (let i = start; i < end; i++) {
        const v = Math.abs(data[i]);
        if (v > max) max = v;
      }
      peaks[b] = max;
    }
  }
  const top = Math.max(...peaks);
  if (!(top > 0)) return peaks.map(() => 0);
  return peaks.map((p) => Math.round((p / top) * 1000) / 1000);
}

/** 클라이언트가 보낸 피크 검증. 숫자 배열(0~1, 최대 PEAK_BUCKETS 개)이 아니면 null */
export function validatePeaks(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > PEAK_BUCKETS) return null;
  for (const v of raw) if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return null;
  return raw as number[];
}


// 밴드 제한 DTW. 두 cent 곡선을 정렬해 워핑 경로를 돌려준다.
// 의존성 없음. 4분 곡(24k 프레임) × 밴드 ±100 프레임 ≈ 5M 셀, 수백 ms.

export interface WarpPath {
  /** 경로상 i 번째 점의 가이드 프레임 */
  guide: Int32Array;
  /** 경로상 i 번째 점의 녹음본 프레임 */
  sub: Int32Array;
  /** 가이드 프레임 g 에 대응되는 녹음본 프레임 (경로의 첫 매칭). 길이 = 가이드 프레임 수 */
  guideToSub: Int32Array;
  totalCost: number;
}

export function frameCost(
  a: number | null,
  b: number | null,
  unvoicedPenalty: number,
): number {
  if (a == null && b == null) return 0;
  if (a == null || b == null) return unvoicedPenalty;
  return Math.abs(a - b);
}

/**
 * @param band 대각선에서 허용하는 최대 이탈 (프레임). |g - s| <= band
 */
export function dtw(
  guide: (number | null)[],
  sub: (number | null)[],
  band: number,
  unvoicedPenalty: number,
): WarpPath {
  const n = guide.length;
  const m = sub.length;
  if (n === 0 || m === 0) {
    return { guide: new Int32Array(0), sub: new Int32Array(0), guideToSub: new Int32Array(n), totalCost: 0 };
  }
  // 길이가 다르면 대각선 기울기 = m/n. 밴드는 그 대각선 기준
  const slope = m / n;
  const width = 2 * band + 1;
  const INF = Number.POSITIVE_INFINITY;
  // 누적 비용 D[g][k], k = s - center(g) + band, center(g) = round(g*slope)
  const D = new Float64Array(n * width).fill(INF);
  // 역추적용: 0 = 대각, 1 = 가이드만 전진(위), 2 = 녹음본만 전진(왼쪽)
  const back = new Uint8Array(n * width);
  const center = (g: number) => Math.round(g * slope);
  const lo = (g: number) => Math.max(0, center(g) - band);
  const hi = (g: number) => Math.min(m - 1, center(g) + band);
  const idx = (g: number, s: number) => g * width + (s - center(g) + band);
  const get = (g: number, s: number) =>
    g < 0 || s < 0 || s < lo(g) || s > hi(g) ? INF : D[idx(g, s)];

  for (let g = 0; g < n; g++) {
    const a = guide[g];
    for (let s = lo(g); s <= hi(g); s++) {
      const c = frameCost(a, sub[s], unvoicedPenalty);
      if (g === 0 && s === 0) {
        D[idx(0, 0)] = c;
        continue;
      }
      const diag = get(g - 1, s - 1);
      const up = get(g - 1, s);
      const left = get(g, s - 1);
      let best = diag, dir = 0;
      if (up < best) { best = up; dir = 1; }
      if (left < best) { best = left; dir = 2; }
      if (best === INF) continue;
      D[idx(g, s)] = best + c;
      back[idx(g, s)] = dir;
    }
  }

  // 끝점은 (n-1, m-1). 밴드 밖이면 마지막 행에서 가장 싼 셀
  let g = n - 1;
  let s = m - 1;
  if (s < lo(g) || s > hi(g) || D[idx(g, s)] === INF) {
    let bestS = lo(g), bestC = INF;
    for (let k = lo(g); k <= hi(g); k++) if (D[idx(g, k)] < bestC) { bestC = D[idx(g, k)]; bestS = k; }
    s = bestS;
  }
  const totalCost = D[idx(g, s)];

  const pg: number[] = [];
  const ps: number[] = [];
  while (g >= 0 && s >= 0) {
    pg.push(g);
    ps.push(s);
    if (g === 0 && s === 0) break;
    const dir = back[idx(g, s)];
    if (dir === 0) { g--; s--; }
    else if (dir === 1) g--;
    else s--;
    // 밴드 경계에서 역추적이 막히면 대각으로 탈출
    if (g >= 0 && s >= 0 && (s < lo(g) || s > hi(g))) { s = Math.min(hi(g), Math.max(lo(g), s)); }
  }
  pg.reverse();
  ps.reverse();

  const guideToSub = new Int32Array(n).fill(-1);
  for (let i = 0; i < pg.length; i++) if (guideToSub[pg[i]] < 0) guideToSub[pg[i]] = ps[i];
  // 경로가 못 덮은 가이드 프레임(이론상 없음)은 앞 값으로 채움
  for (let i = 1; i < n; i++) if (guideToSub[i] < 0) guideToSub[i] = guideToSub[i - 1];
  if (n > 0 && guideToSub[0] < 0) guideToSub[0] = 0;

  return { guide: Int32Array.from(pg), sub: Int32Array.from(ps), guideToSub, totalCost };
}

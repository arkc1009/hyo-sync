// 밴드 제한 DTW. 두 cent 곡선을 정렬해 워핑 경로를 돌려준다.
// 의존성 없음. 4분 곡(24k 프레임) × 밴드 ±100 프레임 ≈ 5M 셀, 수십~수백 ms.

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
 * @param band 대각선에서 허용하는 최대 이탈 (프레임). |s - g*m/n| <= band
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
  // 행 g 의 밴드: center[g] - band .. center[g] + band (m 범위로 클립). 열 s 는 D[g*width + s - center[g] + band]
  const center = new Int32Array(n);
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  for (let g = 0; g < n; g++) {
    center[g] = Math.round(g * slope);
    lo[g] = Math.max(0, center[g] - band);
    hi[g] = Math.min(m - 1, center[g] + band);
  }
  const D = new Float64Array(n * width).fill(INF);
  // 역추적용: 0 = 대각, 1 = 가이드만 전진(위), 2 = 녹음본만 전진(왼쪽)
  const back = new Uint8Array(n * width);

  for (let g = 0; g < n; g++) {
    const a = guide[g];
    const c = center[g];
    const l = lo[g];
    const h = hi[g];
    const rowBase = g * width - c + band; // D[rowBase + s]
    const hasPrev = g > 0;
    const pc = hasPrev ? center[g - 1] : 0;
    const pl = hasPrev ? lo[g - 1] : 0;
    const ph = hasPrev ? hi[g - 1] : -1;
    const prevBase = (g - 1) * width - pc + band;
    for (let s = l; s <= h; s++) {
      const b = sub[s];
      const cost = a == null && b == null ? 0 : a == null || b == null ? unvoicedPenalty : Math.abs(a - b);
      if (g === 0 && s === 0) {
        D[rowBase] = cost;
        continue;
      }
      const diag = hasPrev && s - 1 >= pl && s - 1 <= ph ? D[prevBase + s - 1] : INF;
      const up = hasPrev && s >= pl && s <= ph ? D[prevBase + s] : INF;
      const left = s - 1 >= l ? D[rowBase + s - 1] : INF;
      let best = diag;
      let dir = 0;
      if (up < best) { best = up; dir = 1; }
      if (left < best) { best = left; dir = 2; }
      if (best === INF) continue;
      D[rowBase + s] = best + cost;
      back[rowBase + s] = dir;
    }
  }

  // 끝점은 (n-1, m-1). 밴드 밖이거나 도달 불가면 마지막 행에서 가장 싼 셀
  let g = n - 1;
  let s = m - 1;
  const at = (gg: number, ss: number) => gg * width + ss - center[gg] + band;
  if (s < lo[g] || s > hi[g] || D[at(g, s)] === INF) {
    let bestS = lo[g];
    let bestC = INF;
    for (let k = lo[g]; k <= hi[g]; k++) if (D[at(g, k)] < bestC) { bestC = D[at(g, k)]; bestS = k; }
    s = bestS;
  }
  const totalCost = D[at(g, s)];

  const pg: number[] = [];
  const ps: number[] = [];
  while (g >= 0 && s >= 0) {
    pg.push(g);
    ps.push(s);
    if (g === 0 && s === 0) break;
    const dir = back[at(g, s)];
    if (dir === 0) { g--; s--; }
    else if (dir === 1) g--;
    else s--;
    // 밴드 경계에서 역추적이 막히면 밴드 안으로 당긴다
    if (g >= 0 && s >= 0 && (s < lo[g] || s > hi[g])) s = Math.min(hi[g], Math.max(lo[g], s));
  }
  pg.reverse();
  ps.reverse();

  const guideToSub = new Int32Array(n).fill(-1);
  for (let i = 0; i < pg.length; i++) if (guideToSub[pg[i]] < 0) guideToSub[pg[i]] = ps[i];
  // 경로가 못 덮은 가이드 프레임(이론상 없음)은 앞 값으로 채움
  if (guideToSub[0] < 0) guideToSub[0] = 0;
  for (let i = 1; i < n; i++) if (guideToSub[i] < 0) guideToSub[i] = guideToSub[i - 1];

  return { guide: Int32Array.from(pg), sub: Int32Array.from(ps), guideToSub, totalCost };
}

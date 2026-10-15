/** 123456 → "2:03" */
export function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** 123456 → "2:03.5" (소절 위치 표시용) */
export function formatMsFine(ms: number) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(1).padStart(4, "0");
  return `${m}:${rest}`;
}

/** +37.2 → "+37¢ ♯", -12 → "−12¢ ♭" */
export function formatCents(c: number) {
  const r = Math.round(c);
  if (r === 0) return "0¢";
  return r > 0 ? `+${r}¢ ♯` : `−${-r}¢ ♭`;
}

/** +80 → "+80ms 늦음", -30 → "−30ms 빠름" */
export function formatOffset(ms: number) {
  const r = Math.round(ms);
  if (r === 0) return "0ms";
  return r > 0 ? `+${r}ms 늦음` : `−${-r}ms 빠름`;
}

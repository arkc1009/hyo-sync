"use client";

import { useEffect, useRef, useState } from "react";
import type { PhraseResult } from "@/lib/analysis/types";
import { formatCents, formatMsFine, formatOffset } from "@/lib/format";
import { REASON_LABEL, VERDICT_COLOR, VERDICT_LABEL } from "@/lib/labels";

interface Props {
  phrases: PhraseResult[];
  guideUrl: string;
  subUrl: string;
  guideDurationMs: number;
}

/** 소절 타임라인 + 표 + 구간 A/B 재생 */
export default function ReportView({ phrases, guideUrl, subUrl, guideDurationMs }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const guideRef = useRef<HTMLAudioElement>(null);
  const subRef = useRef<HTMLAudioElement>(null);
  const stopAt = useRef<{ el: HTMLAudioElement; endS: number } | null>(null);
  const [playing, setPlaying] = useState<"guide" | "sub" | null>(null);

  // 구간 끝에서 멈춤
  useEffect(() => {
    const onTime = (e: Event) => {
      const s = stopAt.current;
      if (s && e.target === s.el && s.el.currentTime >= s.endS) {
        s.el.pause();
        stopAt.current = null;
        setPlaying(null);
      }
    };
    const g = guideRef.current, u = subRef.current;
    g?.addEventListener("timeupdate", onTime);
    u?.addEventListener("timeupdate", onTime);
    return () => {
      g?.removeEventListener("timeupdate", onTime);
      u?.removeEventListener("timeupdate", onTime);
    };
  }, []);

  function stopAll() {
    guideRef.current?.pause();
    subRef.current?.pause();
    stopAt.current = null;
    setPlaying(null);
  }

  async function play(which: "guide" | "sub", p: PhraseResult) {
    stopAll();
    const el = which === "guide" ? guideRef.current : subRef.current;
    if (!el) return;
    // 소절 앞뒤 150ms 여유
    const start = (which === "guide" ? p.guideStartMs : p.subStartMs) - 150;
    const end = (which === "guide" ? p.guideEndMs : p.subEndMs) + 150;
    el.currentTime = Math.max(0, start) / 1000;
    stopAt.current = { el, endS: end / 1000 };
    setPlaying(which);
    try {
      await el.play();
    } catch {
      setPlaying(null);
    }
  }

  const sel = selected == null ? null : phrases[selected];

  return (
    <div>
      <audio ref={guideRef} src={guideUrl} preload="auto" />
      <audio ref={subRef} src={subUrl} preload="auto" />

      {/* 타임라인: 가이드 시간축 위에 소절을 verdict 색으로 */}
      <div
        style={{ position: "relative", height: 36, background: "var(--surface-2)", borderRadius: 4, margin: "8px 0 4px" }}
        aria-label="소절 타임라인"
      >
        {phrases.map((p) => {
          const left = (p.guideStartMs / guideDurationMs) * 100;
          const width = Math.max(0.5, ((p.guideEndMs - p.guideStartMs) / guideDurationMs) * 100);
          const isSel = selected === p.index;
          return (
            <button
              key={p.index}
              type="button"
              title={`${p.index + 1}: ${VERDICT_LABEL[p.verdict]}`}
              onClick={() => setSelected(p.index)}
              style={{
                position: "absolute", top: isSel ? 0 : 6, bottom: isSel ? 0 : 6,
                left: `${left}%`, width: `${width}%`,
                background: VERDICT_COLOR[p.verdict], border: isSel ? "2px solid currentColor" : "none",
                borderRadius: 3, padding: 0, cursor: "pointer",
              }}
            />
          );
        })}
      </div>
      <small style={{ display: "flex", gap: 12 }}>
        {(["OK", "FIXABLE", "RERECORD", "UNRELIABLE"] as const).map((v) => (
          <span key={v}><span style={{ display: "inline-block", width: 10, height: 10, background: VERDICT_COLOR[v], marginRight: 4 }} />{VERDICT_LABEL[v]}</span>
        ))}
      </small>

      {sel && (
        <div style={{ margin: "12px 0", padding: 12, border: "1px solid var(--border)", borderRadius: 6 }}>
          <strong>소절 {sel.index + 1}</strong> · {formatMsFine(sel.guideStartMs)}–{formatMsFine(sel.guideEndMs)} ·{" "}
          <span style={{ color: VERDICT_COLOR[sel.verdict] }}>{VERDICT_LABEL[sel.verdict]}</span>
          {sel.reasons.length > 0 && <> · {sel.reasons.map((r) => REASON_LABEL[r]).join(", ")}</>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => play("guide", sel)} disabled={playing === "guide"}>▶ 가이드</button>
            <button type="button" onClick={() => play("sub", sel)} disabled={playing === "sub"}>▶ 내 녹음</button>
            <button type="button" onClick={stopAll} disabled={!playing}>■</button>
          </div>
        </div>
      )}

      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14 }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th>#</th><th>구간</th><th>판정</th><th>음정</th><th>시작 타이밍</th><th>유성 비율</th><th>사유</th>
          </tr>
        </thead>
        <tbody>
          {phrases.map((p) => (
            <tr
              key={p.index}
              onClick={() => setSelected(p.index)}
              style={{ cursor: "pointer", background: selected === p.index ? "var(--surface-2)" : undefined, borderTop: "1px solid var(--border)" }}
            >
              <td>{p.index + 1}</td>
              <td>{formatMsFine(p.guideStartMs)}–{formatMsFine(p.guideEndMs)}</td>
              <td style={{ color: VERDICT_COLOR[p.verdict], fontWeight: 600 }}>{VERDICT_LABEL[p.verdict]}</td>
              <td>{p.verdict === "UNRELIABLE" ? "–" : formatCents(p.pitch.medianCents)}</td>
              <td>{p.verdict === "UNRELIABLE" ? "–" : formatOffset(p.timing.onsetMs)}</td>
              <td>{Math.round(p.coverage * 100)}%</td>
              <td>{p.reasons.map((r) => REASON_LABEL[r]).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

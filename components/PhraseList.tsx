"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { PhraseResult } from "@/lib/analysis/types";
import { formatCents, formatMsFine, formatOffset } from "@/lib/format";
import { REASON_LABEL, VERDICT_LABEL, VERDICT_TONE } from "@/lib/labels";
import styles from "./PhraseList.module.css";

interface Props {
  phrases: PhraseResult[];
  selected: number | null;
  playing: boolean;
  onSelect: (p: PhraseResult) => void;
  onPlay: (p: PhraseResult, role: "mine" | "guide") => void;
  onPlayMix: (p: PhraseResult) => void;
  onStop: () => void;
}

/** 리포트 소절 목록. 기본은 다시 볼 소절(재녹음·보정)만, 고르면 가이드/내 녹음 A/B 재생 */
export default function PhraseList({ phrases, selected, playing, onSelect, onPlay, onPlayMix, onStop }: Props) {
  const issues = phrases.filter((p) => p.verdict === "RERECORD" || p.verdict === "FIXABLE");
  const [tab, setTab] = useState<"issues" | "all">(issues.length > 0 ? "issues" : "all");
  const shown = tab === "issues" ? issues : phrases;

  return (
    <section className={styles.wrap}>
      <div className={styles.head}>
        <h3>소절</h3>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" className={styles.tab} aria-selected={tab === "issues"} onClick={() => setTab("issues")}>
            다시 볼 소절 {issues.length}
          </button>
          <button type="button" role="tab" className={styles.tab} aria-selected={tab === "all"} onClick={() => setTab("all")}>
            전체 {phrases.length}
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>다시 볼 소절이 없어요. 전부 OK예요.</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((p) => {
            const isSel = selected === p.index;
            const reliable = p.verdict !== "UNRELIABLE";
            return (
              <li key={p.index} className={styles.row} data-selected={isSel || undefined} onClick={() => onSelect(p)}>
                <span className={`${styles.num} mono`}>{p.index + 1}</span>
                <span className={`${styles.time} mono`}>{formatMsFine(p.subStartMs)}–{formatMsFine(p.subEndMs)}</span>
                <span><Badge tone={VERDICT_TONE[p.verdict]} dot>{VERDICT_LABEL[p.verdict]}</Badge></span>
                <span className={styles.detail}>
                  {reliable && <span>음정 <strong className="mono">{formatCents(p.pitch.medianCents)}</strong></span>}
                  {reliable && <span>시작 <strong className="mono">{formatOffset(p.timing.onsetMs)}</strong></span>}
                  {p.reasons.length > 0 && <span>{p.reasons.map((r) => REASON_LABEL[r]).join(", ")}</span>}
                </span>
                {isSel && (
                  <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" onClick={() => onPlay(p, "guide")}>▶ 가이드</Button>
                    <Button size="sm" onClick={() => onPlay(p, "mine")}>▶ 내 녹음</Button>
                    <Button size="sm" variant="ghost" onClick={() => onPlayMix(p)}>▶ 반주와 같이</Button>
                    {playing && <Button size="sm" variant="ghost" onClick={onStop}>■ 정지</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

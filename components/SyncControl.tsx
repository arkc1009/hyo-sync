"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SYNC } from "@/lib/analysis/thresholds";
import { formatSyncOffset } from "@/lib/mix/sync";
import styles from "./SyncControl.module.css";

export interface SyncInfo {
  /** 담당자나 녹음본 주인이면 true */
  editable: boolean;
  /** 저장된 오프셋 */
  savedMs: number;
  /** 자동으로 찾은 값. 못 찾았으면 null */
  autoMs: number | null;
  /** 자동 탐색 신뢰도. null 이면 아직 안 해 봄 */
  confidence: number | null;
  /** 자동 탐색 방법: server = 피치 곡선(가이드 비교 제출), client = 가이드 파일과 파형 비교, null = 가이드 없음 */
  detect: { kind: "server" } | { kind: "client"; guideSrc: string } | null;
}

const STEPS = [-50, -10, 10, 50];

/** 믹서 채널의 시작 싱크 표시·조정. 숫자를 바꾸면 바로 들리고, 저장해야 남는다 */
export default function SyncControl(props: {
  submissionId: string;
  /** 녹음본 audioSrc() 경로 (브라우저 자동 탐색용) */
  recordingSrc: string;
  info: SyncInfo;
  offsetMs: number;
  onChange: (offsetMs: number) => void;
}) {
  const { info, offsetMs, onChange } = props;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(info.savedMs);
  const [autoMs, setAutoMs] = useState(info.autoMs);
  const [busy, setBusy] = useState<"save" | "detect" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const dirty = offsetMs !== saved;
  const clamp = (ms: number) => Math.max(-SYNC.maxOffsetMs, Math.min(SYNC.maxOffsetMs, Math.round(ms)));

  async function patch(body: object) {
    const res = await fetch(`/api/submissions/${props.submissionId}/sync`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { syncOffsetMs?: number; syncAutoMs?: number | null; error?: string };
    if (!res.ok || json.syncOffsetMs == null) throw new Error(json.error ?? res.statusText);
    setSaved(json.syncOffsetMs);
    if (json.syncAutoMs !== undefined) setAutoMs(json.syncAutoMs);
    onChange(json.syncOffsetMs);
    // 리포트(소절 판정)가 새 오프셋으로 다시 계산됐을 수 있다
    router.refresh();
    return json.syncOffsetMs;
  }

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      await patch({ offsetMs });
      setMessage({ tone: "ok", text: "저장했어요" });
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function detect() {
    if (!info.detect) return;
    setBusy("detect");
    setMessage(null);
    try {
      let body: object = { detect: true };
      if (info.detect.kind === "client") {
        const { detectSyncOffset } = await import("@/lib/mix/sync-browser");
        const estimate = await detectSyncOffset(info.detect.guideSrc, props.recordingSrc);
        if (!estimate) throw new Error("오디오를 읽지 못했어요");
        body = { estimate };
      }
      const ms = await patch(body);
      setMessage({ tone: "ok", text: `가이드 기준 ${formatSyncOffset(ms)}로 맞췄어요` });
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const status = info.confidence == null ? null : autoMs != null && saved === autoMs ? "자동" : autoMs != null ? "직접" : "자동 실패";
  const summary = (
    <>
      <span className={styles.key}>싱크</span>
      <span className="mono">{formatSyncOffset(offsetMs)}</span>
      {dirty ? <span className={styles.dirty}>저장 안 됨</span> : status && <span className={styles.status} data-fail={status === "자동 실패" || undefined}>{status}</span>}
    </>
  );

  if (!info.editable) {
    return offsetMs !== 0 ? <div className={styles.summary} title="가이드 기준 시작 싱크">{summary}</div> : null;
  }

  return (
    <div className={styles.root}>
      <button type="button" className={styles.summary} data-button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        title="가이드 기준 시작 싱크. +면 이 녹음의 소리가 가이드보다 늦게 나와서 앞을 건너뛰고 재생해요">
        {summary}
        <span className={styles.caret} aria-hidden>{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className={styles.panel}>
          <div className={styles.row}>
            {STEPS.slice(0, 2).map((d) => (
              <button key={d} type="button" className={styles.step} onClick={() => onChange(clamp(offsetMs + d))} aria-label={`${d}ms`}>{d}</button>
            ))}
            <input
              type="number"
              className={`${styles.input} mono`}
              value={offsetMs}
              step={10}
              aria-label="시작 싱크 (ms)"
              onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(clamp(v)); }}
            />
            {STEPS.slice(2).map((d) => (
              <button key={d} type="button" className={styles.step} onClick={() => onChange(clamp(offsetMs + d))} aria-label={`+${d}ms`}>+{d}</button>
            ))}
          </div>
          <div className={styles.row} data-wrap>
            {info.detect && (
              <button type="button" className={styles.action} onClick={detect} disabled={!!busy}>
                {busy === "detect" ? "찾는 중…" : "자동 맞추기"}
              </button>
            )}
            {dirty && (
              <>
                <button type="button" className={styles.action} data-primary onClick={save} disabled={!!busy}>{busy === "save" ? "저장 중…" : "저장"}</button>
                <button type="button" className={styles.action} onClick={() => onChange(saved)} disabled={!!busy}>취소</button>
              </>
            )}
          </div>
          {message && <small className={styles.message} data-tone={message.tone}>{message.text}</small>}
          {!info.detect && <small className={styles.message}>파트에 가이드가 없어 자동으로는 못 맞춰요.</small>}
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMsFine } from "@/lib/format";
import { channelGains, COMMENT_PREROLL_MS, needsResync, type ChannelState } from "@/lib/mix";

export interface MixChannel {
  id: string;
  label: string;
  url: string;
  durationMs: number;
  /** 녹음본이면 제출 id. INST 는 없음 */
  submissionId?: string;
}

export interface MixComment {
  id: string;
  submissionId: string;
  startMs: number;
  endMs: number;
  body: string;
  createdAt: string;
}

interface Props {
  channels: MixChannel[];
  comments: MixComment[];
  /** 담당자면 true: 구간 코멘트 작성·삭제 */
  canComment: boolean;
}

type Range = { startMs: number; endMs: number };

const TICK_MS = 100;
const DRAG_MIN_PX = 4;
const COMMENT_COLOR = "#6e56cf";

/**
 * INST + 녹음본 동시 재생. 채널마다 <audio> 하나, 가장 긴 채널을 기준 시계로 두고 나머지를 맞춘다.
 * 볼륨은 HTMLMediaElement.volume (iOS 는 볼륨 무시, 뮤트·솔로만 동작). url 은 audioSrc() 프록시 경로
 */
export default function Mixer({ channels, comments: initialComments, canComment }: Props) {
  const els = useRef<(HTMLAudioElement | null)[]>([]);
  const [states, setStates] = useState<ChannelState[]>(() => channels.map(() => ({ volume: 0.8, muted: false, solo: false })));
  const [posMs, setPosMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stopAtMs = useRef<number | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [comments, setComments] = useState(initialComments);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totalMs = useMemo(() => Math.max(1, ...channels.map((c) => c.durationMs)), [channels]);
  const masterIdx = useMemo(() => channels.reduce((best, c, i) => (c.durationMs > channels[best].durationMs ? i : best), 0), [channels]);
  const labelBySub = useMemo(() => new Map(channels.filter((c) => c.submissionId).map((c) => [c.submissionId!, c.label])), [channels]);

  // 볼륨·뮤트·솔로 반영
  useEffect(() => {
    const gains = channelGains(states);
    els.current.forEach((el, i) => {
      if (!el) return;
      el.volume = gains[i];
      el.muted = gains[i] === 0;
    });
  }, [states]);

  const pauseAll = useCallback(() => {
    els.current.forEach((el) => el?.pause());
    stopAtMs.current = null;
    setPlaying(false);
  }, []);

  // 언마운트 시 정지
  useEffect(() => pauseAll, [pauseAll]);

  // 재생 중: 기준 시계 따라 위치 갱신, 벌어진 채널 재동기화, 구간 끝에서 정지
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const master = els.current[masterIdx];
      if (!master) return;
      const t = master.currentTime;
      setPosMs(t * 1000);
      if (master.ended || (stopAtMs.current != null && t * 1000 >= stopAtMs.current)) {
        pauseAll();
        return;
      }
      els.current.forEach((el, i) => {
        if (!el || i === masterIdx) return;
        const durS = channels[i].durationMs / 1000;
        // 버퍼링 중인 채널을 계속 당기면 끊김이 반복되므로 재생 가능한 상태일 때만
        if (el.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
        if (needsResync(t, el.currentTime, durS)) el.currentTime = t;
        if (el.paused && t < durS) void el.play().catch(() => {});
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, [playing, masterIdx, channels, pauseAll]);

  async function playFrom(ms: number, stopAt: number | null = null) {
    els.current.forEach((el) => el?.pause());
    const t = Math.max(0, Math.min(ms, totalMs)) / 1000;
    els.current.forEach((el, i) => {
      if (el) el.currentTime = Math.min(t, channels[i].durationMs / 1000);
    });
    stopAtMs.current = stopAt;
    setPosMs(t * 1000);
    setPlaying(true);
    const started = await Promise.allSettled(
      els.current.map((el, i) => (el && t < channels[i].durationMs / 1000 ? el.play() : Promise.resolve())),
    );
    if (started.every((r) => r.status === "rejected")) setPlaying(false);
  }

  function seek(ms: number) {
    if (playing) void playFrom(ms, stopAtMs.current);
    else {
      setPosMs(ms);
      els.current.forEach((el, i) => {
        if (el) el.currentTime = Math.min(ms, channels[i].durationMs) / 1000;
      });
    }
  }

  function toggle() {
    if (playing) {
      const master = els.current[masterIdx];
      pauseAll();
      if (master) setPosMs(master.currentTime * 1000);
    } else void playFrom(posMs >= totalMs ? 0 : posMs);
  }

  function playComment(c: MixComment) {
    setSelectedId(c.id);
    setRange({ startMs: c.startMs, endMs: c.endMs });
    void playFrom(Math.max(0, c.startMs - COMMENT_PREROLL_MS), c.endMs);
  }

  function update(i: number, patch: Partial<ChannelState>) {
    setStates((s) => s.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  async function removeComment(id: string) {
    if (!confirm("이 코멘트를 지울까요?")) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) setComments((cs) => cs.filter((c) => c.id !== id));
  }

  const sorted = useMemo(() => [...comments].sort((a, b) => a.startMs - b.startMs), [comments]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {channels.map((c, i) => (
        <audio key={c.id} ref={(el) => { els.current[i] = el; }} src={c.url} preload="auto" />
      ))}

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={toggle} style={{ minWidth: 64 }}>{playing ? "❚❚ 정지" : "▶ 재생"}</button>
        <small style={{ fontVariantNumeric: "tabular-nums" }}>{formatMsFine(posMs)} / {formatMsFine(totalMs)}</small>
        {range && (
          <>
            <small>· 구간 {formatMsFine(range.startMs)}–{formatMsFine(range.endMs)}</small>
            <button type="button" onClick={() => playFrom(range.startMs, range.endMs)}>▶ 구간</button>
            <button type="button" onClick={() => { setRange(null); setSelectedId(null); }}>구간 해제</button>
          </>
        )}
      </div>

      <Timeline
        totalMs={totalMs}
        posMs={posMs}
        range={range}
        markers={sorted}
        selectedId={selectedId}
        onSeek={seek}
        onRange={(r) => { setRange(r); setSelectedId(null); }}
        onMarker={playComment}
      />
      <small style={{ opacity: 0.7 }}>타임라인을 클릭하면 그 위치로, 드래그하면 구간을 잡아요.</small>

      <div style={{ display: "grid", gap: 6 }}>
        {channels.map((c, i) => {
          const s = states[i];
          const own = c.submissionId ? sorted.filter((m) => m.submissionId === c.submissionId) : [];
          return (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 220px) 1fr", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center", minWidth: 0 }}>
                <button type="button" onClick={() => update(i, { muted: !s.muted })} aria-pressed={s.muted} title="뮤트"
                  style={{ fontWeight: s.muted ? 700 : 400, opacity: s.muted ? 1 : 0.6 }}>M</button>
                <button type="button" onClick={() => update(i, { solo: !s.solo })} aria-pressed={s.solo} title="솔로"
                  style={{ fontWeight: s.solo ? 700 : 400, opacity: s.solo ? 1 : 0.6 }}>S</button>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.label}>{c.label}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="range" min={0} max={100} value={Math.round(s.volume * 100)} aria-label={`${c.label} 볼륨`}
                  onChange={(e) => update(i, { volume: Number(e.target.value) / 100 })} style={{ width: 120 }} />
                <small style={{ width: 32, fontVariantNumeric: "tabular-nums" }}>{Math.round(s.volume * 100)}</small>
                {/* 채널별 코멘트 위치 */}
                <div style={{ position: "relative", flex: 1, height: 10, background: "#8881", borderRadius: 2 }}>
                  {c.durationMs < totalMs && (
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: `${(c.durationMs / totalMs) * 100}%`, right: 0, background: "#8883" }} />
                  )}
                  {own.map((m) => (
                    <button key={m.id} type="button" title={m.body} onClick={() => playComment(m)}
                      style={{
                        position: "absolute", top: 0, bottom: 0, padding: 0, border: "none", cursor: "pointer", borderRadius: 2,
                        left: `${(m.startMs / totalMs) * 100}%`, width: `${Math.max(0.4, ((m.endMs - m.startMs) / totalMs) * 100)}%`,
                        background: COMMENT_COLOR, opacity: selectedId === m.id ? 1 : 0.6,
                      }} />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canComment && (
        <CommentForm
          targets={channels.filter((c): c is MixChannel & { submissionId: string } => !!c.submissionId)}
          range={range}
          posMs={posMs}
          onRange={setRange}
          onCreated={(c) => { setComments((cs) => [...cs, c]); setSelectedId(c.id); }}
        />
      )}

      <section>
        <h3 style={{ margin: "8px 0" }}>코멘트 {sorted.length}개</h3>
        {sorted.length === 0 ? (
          <small>{canComment ? "구간을 잡고 코멘트를 남기면 멤버가 여기서 확인해요." : "아직 남겨진 코멘트가 없어요."}</small>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {sorted.map((c) => (
              <li key={c.id} style={{
                padding: 8, borderRadius: 6, border: `1px solid ${selectedId === c.id ? COMMENT_COLOR : "#8884"}`,
                display: "flex", gap: 8, alignItems: "flex-start",
              }}>
                <button type="button" onClick={() => playComment(c)} title="구간 재생">▶</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <small style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatMsFine(c.startMs)}–{formatMsFine(c.endMs)}
                    {labelBySub.size > 1 && <> · {labelBySub.get(c.submissionId)}</>}
                  </small>
                  <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
                </div>
                {canComment && <button type="button" onClick={() => removeComment(c.id)} title="삭제">✕</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Timeline(props: {
  totalMs: number;
  posMs: number;
  range: Range | null;
  markers: MixComment[];
  selectedId: string | null;
  onSeek: (ms: number) => void;
  onRange: (r: Range) => void;
  onMarker: (c: MixComment) => void;
}) {
  const { totalMs, posMs, range, markers, selectedId } = props;
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; ms: number } | null>(null);
  const [preview, setPreview] = useState<Range | null>(null);

  function msAt(clientX: number) {
    const r = ref.current!.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * totalMs);
  }

  const shown = preview ?? range;
  const pct = (ms: number) => `${(ms / totalMs) * 100}%`;

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="재생 위치"
      aria-valuemin={0}
      aria-valuemax={totalMs}
      aria-valuenow={Math.round(posMs)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") props.onSeek(Math.min(totalMs, posMs + 5000));
        if (e.key === "ArrowLeft") props.onSeek(Math.max(0, posMs - 5000));
      }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).dataset.marker) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, ms: msAt(e.clientX) };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || Math.abs(e.clientX - d.x) < DRAG_MIN_PX) return;
        const ms = msAt(e.clientX);
        setPreview({ startMs: Math.min(d.ms, ms), endMs: Math.max(d.ms, ms) });
      }}
      onPointerUp={() => {
        const d = drag.current;
        drag.current = null;
        if (!d) return;
        if (preview) {
          props.onRange(preview);
          setPreview(null);
        } else props.onSeek(d.ms);
      }}
      style={{ position: "relative", height: 44, background: "#8882", borderRadius: 4, cursor: "pointer", touchAction: "none", userSelect: "none" }}
    >
      {shown && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(shown.startMs), width: pct(shown.endMs - shown.startMs), background: "#6e56cf33", borderLeft: "1px solid #6e56cf", borderRight: "1px solid #6e56cf" }} />
      )}
      {markers.map((m) => (
        <button
          key={m.id}
          type="button"
          data-marker="1"
          title={`${formatMsFine(m.startMs)} ${m.body}`}
          onClick={() => props.onMarker(m)}
          style={{
            position: "absolute", top: 2, height: 8, padding: 0, border: "none", borderRadius: 2, cursor: "pointer",
            left: pct(m.startMs), width: `max(4px, ${pct(m.endMs - m.startMs)})`,
            background: COMMENT_COLOR, opacity: selectedId === m.id ? 1 : 0.6,
          }}
        />
      ))}
      <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(posMs), width: 2, background: "currentColor", pointerEvents: "none" }} />
    </div>
  );
}

function CommentForm(props: {
  targets: (MixChannel & { submissionId: string })[];
  range: Range | null;
  posMs: number;
  onRange: (r: Range) => void;
  onCreated: (c: MixComment) => void;
}) {
  const { targets, range, posMs } = props;
  const [target, setTarget] = useState(targets[0]?.submissionId ?? "");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) return null;

  async function submit() {
    if (!range || !target || !body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${target}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...range, body }),
      });
      const json = (await res.json().catch(() => ({}))) as Partial<MixComment> & { error?: string };
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      props.onCreated(json as MixComment);
      setBody("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const start = range?.startMs ?? null;
  const end = range?.endMs ?? null;

  return (
    <section style={{ padding: 12, border: "1px solid #8884", borderRadius: 6, display: "grid", gap: 8 }}>
      <strong>구간 코멘트</strong>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {targets.length > 1 && (
          <label>
            대상{" "}
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => <option key={t.submissionId} value={t.submissionId}>{t.label}</option>)}
            </select>
          </label>
        )}
        <button type="button" onClick={() => props.onRange({ startMs: Math.round(posMs), endMs: Math.max(Math.round(posMs), end ?? 0) })}>
          시작 = 현재 위치
        </button>
        <button type="button" onClick={() => props.onRange({ startMs: Math.min(start ?? Math.round(posMs), Math.round(posMs)), endMs: Math.round(posMs) })}>
          끝 = 현재 위치
        </button>
        <small style={{ fontVariantNumeric: "tabular-nums" }}>
          {range ? `${formatMsFine(range.startMs)}–${formatMsFine(range.endMs)}` : "구간을 먼저 잡아 주세요"}
        </small>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="예: 여기 음이 살짝 낮아요. 끝음 반 박 더 끌어 주세요" />
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={submit} disabled={busy || !range || !body.trim()}>코멘트 남기기</button>
        {error && <small style={{ color: "crimson" }}>에러: {error}</small>}
      </div>
    </section>
  );
}

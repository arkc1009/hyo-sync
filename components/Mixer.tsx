"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import PhraseList from "@/components/PhraseList";
import type { PhraseResult, Verdict } from "@/lib/analysis/types";
import { formatMsFine } from "@/lib/format";
import { VERDICT_COLOR } from "@/lib/labels";
import { channelGains, COMMENT_PREROLL_MS, needsResync, type ChannelState } from "@/lib/mix";
import { backfillPeaks } from "@/lib/mix/peaks-browser";
import styles from "./Mixer.module.css";

export interface MixChannel {
  id: string;
  label: string;
  url: string;
  durationMs: number;
  /** 녹음본이면 제출 id. INST 는 없음 */
  submissionId?: string;
  /** 원본 Blob 주소. 피크가 없을 때 브라우저에서 계산해 저장할 때 쓴다 */
  blobUrl: string;
  /** 파형 피크 (lib/mix/peaks.ts). null 이면 처음 열 때 계산 */
  peaks: number[] | null;
  /** 리포트 화면: 내 녹음·가이드 채널. 소절 판정색을 파형에 칠하고 소절별 A/B 재생에 쓴다 */
  role?: "mine" | "guide";
  /** 처음에 뮤트 (가이드는 내 녹음과 겹쳐 들리지 않게) */
  initiallyMuted?: boolean;
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
  /** 리포트 화면: 자동 분석 소절. 있으면 role 채널 파형에 판정색을 칠하고 소절 목록을 보여 준다 */
  phrases?: PhraseResult[];
}

/** 소절 앞뒤 여유 (A/B 재생) */
const PHRASE_PAD_MS = 150;

type Range = { startMs: number; endMs: number };

const TICK_MS = 100;
const DRAG_MIN_PX = 4;
const COMMENT_COLOR = "var(--accent)";

/**
 * INST + 녹음본 동시 재생. 채널마다 <audio> 하나, 가장 긴 채널을 기준 시계로 두고 나머지를 맞춘다.
 * 볼륨은 HTMLMediaElement.volume (iOS 는 볼륨 무시, 뮤트·솔로만 동작). url 은 audioSrc() 경로 (서명 URL 로 리다이렉트)
 */
export default function Mixer({ channels, comments: initialComments, canComment, phrases }: Props) {
  const els = useRef<(HTMLAudioElement | null)[]>([]);
  const [states, setStates] = useState<ChannelState[]>(() =>
    channels.map((c) => ({ volume: 0.8, muted: !!c.initiallyMuted, solo: false })),
  );
  const [phraseIdx, setPhraseIdx] = useState<number | null>(null);
  const [posMs, setPosMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const stopAtMs = useRef<number | null>(null);
  const [range, setRange] = useState<Range | null>(null);
  const [comments, setComments] = useState(initialComments);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [peaks, setPeaks] = useState(() => new Map(channels.map((c) => [c.id, c.peaks])));

  // 피크 없는 옛 트랙: 하나씩 받아 계산하고 서버에 채워 둔다 (다음부터는 바로 보임)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const c of channels) {
        if (c.peaks || cancelled) continue;
        const p = await backfillPeaks(c.blobUrl, c.url);
        // 실패하면 빈 배열 → 파형 없이 가는 선만
        if (!cancelled) setPeaks((m) => new Map(m).set(c.id, p ?? []));
      }
    })();
    return () => { cancelled = true; };
  }, [channels]);

  const totalMs = useMemo(() => Math.max(1, ...channels.map((c) => c.durationMs)), [channels]);
  const masterIdx = useMemo(() => channels.reduce((best, c, i) => (c.durationMs > channels[best].durationMs ? i : best), 0), [channels]);
  const labelBySub = useMemo(() => new Map(channels.filter((c) => c.submissionId).map((c) => [c.submissionId!, c.label])), [channels]);

  const gains = useMemo(() => channelGains(states), [states]);

  // 볼륨·뮤트·솔로 반영
  useEffect(() => {
    els.current.forEach((el, i) => {
      if (!el) return;
      el.volume = gains[i];
      el.muted = gains[i] === 0;
    });
  }, [gains]);

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
    setPhraseIdx(null);
    setRange({ startMs: c.startMs, endMs: c.endMs });
    void playFrom(Math.max(0, c.startMs - COMMENT_PREROLL_MS), c.endMs);
  }

  function selectPhrase(p: PhraseResult) {
    setPhraseIdx(p.index);
    setSelectedId(null);
    setRange({ startMs: p.subStartMs, endMs: p.subEndMs });
  }

  /** 소절 하나를 가이드 또는 내 녹음만 솔로로 재생 */
  function playPhrase(p: PhraseResult, role: "mine" | "guide") {
    selectPhrase(p);
    const target = channels.findIndex((c) => c.role === role);
    if (target < 0) return;
    setStates((s) => s.map((c, j) => ({ ...c, solo: j === target })));
    const [start, end] = role === "guide" ? [p.guideStartMs, p.guideEndMs] : [p.subStartMs, p.subEndMs];
    void playFrom(Math.max(0, start - PHRASE_PAD_MS), end + PHRASE_PAD_MS);
  }

  /** 솔로를 풀고 내 녹음 + INST 로 그 소절 재생 */
  function playPhraseMix(p: PhraseResult) {
    selectPhrase(p);
    setStates((s) => s.map((c) => ({ ...c, solo: false })));
    void playFrom(Math.max(0, p.subStartMs - COMMENT_PREROLL_MS), p.subEndMs + PHRASE_PAD_MS);
  }

  const bandsByRole = useMemo(() => {
    if (!phrases) return null;
    const toBand = (start: number, end: number, p: PhraseResult) => ({ index: p.index, startMs: start, endMs: end, verdict: p.verdict });
    return {
      mine: phrases.map((p) => toBand(p.subStartMs, p.subEndMs, p)),
      guide: phrases.map((p) => toBand(p.guideStartMs, p.guideEndMs, p)),
    };
  }, [phrases]);

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

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" onClick={toggle} style={{ minWidth: 64 }}>{playing ? "❚❚ 정지" : "▶ 재생"}</button>
        <small style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{formatMsFine(posMs)} / {formatMsFine(totalMs)}</small>
        {range && (
          <>
            <small style={{ whiteSpace: "nowrap" }}>· 구간 {formatMsFine(range.startMs)}–{formatMsFine(range.endMs)}</small>
            <button type="button" onClick={() => playFrom(range.startMs, range.endMs)}>▶ 구간</button>
            <button type="button" onClick={() => { setRange(null); setSelectedId(null); setPhraseIdx(null); }}>구간 해제</button>
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
        onRange={(r) => { setRange(r); setSelectedId(null); setPhraseIdx(null); }}
        onMarker={playComment}
      />
      <small style={{ opacity: 0.7 }}>타임라인을 클릭하면 그 위치로, 드래그하면 구간을 잡아요.</small>

      <div className={styles.channels}>
        {channels.map((c, i) => {
          const s = states[i];
          const own = c.submissionId ? sorted.filter((m) => m.submissionId === c.submissionId) : [];
          const silent = gains[i] === 0;
          return (
            <div key={c.id} className={styles.channel}>
              <div className={styles.strip}>
                <span className={styles.label} title={c.label}>{c.label}</span>
                <div className={styles.controls}>
                  <button type="button" className={styles.toggle} data-on={s.muted || undefined} data-kind="mute"
                    onClick={() => update(i, { muted: !s.muted })} aria-pressed={s.muted} title="뮤트">M</button>
                  <button type="button" className={styles.toggle} data-on={s.solo || undefined} data-kind="solo"
                    onClick={() => update(i, { solo: !s.solo })} aria-pressed={s.solo} title="솔로">S</button>
                  <input type="range" min={0} max={100} value={Math.round(s.volume * 100)} aria-label={`${c.label} 볼륨`}
                    className={styles.volume} onChange={(e) => update(i, { volume: Number(e.target.value) / 100 })} />
                  <small className={`${styles.volumeValue} mono`}>{Math.round(s.volume * 100)}</small>
                </div>
              </div>
              <Lane
                peaks={peaks.get(c.id) ?? null}
                widthPct={(c.durationMs / totalMs) * 100}
                posPct={(posMs / totalMs) * 100}
                range={range && { left: (range.startMs / totalMs) * 100, width: ((range.endMs - range.startMs) / totalMs) * 100 }}
                silent={silent}
                label={c.label}
                bands={c.role && bandsByRole ? bandsByRole[c.role] : undefined}
                selectedBand={phraseIdx}
                onBand={(i) => phrases && selectPhrase(phrases[i])}
                totalMs={totalMs}
                durationMs={c.durationMs}
                onSeek={(ratio) => seek(Math.round(ratio * totalMs))}
              >
                {own.map((m) => (
                  <button key={m.id} type="button" title={m.body} onClick={(e) => { e.stopPropagation(); playComment(m); }}
                    className={styles.laneComment} data-selected={selectedId === m.id || undefined}
                    style={{ left: `${(m.startMs / totalMs) * 100}%`, width: `max(4px, ${((m.endMs - m.startMs) / totalMs) * 100}%)` }} />
                ))}
              </Lane>
            </div>
          );
        })}
      </div>

      {phrases && phrases.length > 0 && (
        <PhraseList
          phrases={phrases}
          selected={phraseIdx}
          playing={playing}
          onSelect={selectPhrase}
          onPlay={playPhrase}
          onPlayMix={playPhraseMix}
          onStop={pauseAll}
        />
      )}

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
                padding: 8, borderRadius: 6, border: `1px solid ${selectedId === c.id ? COMMENT_COLOR : "var(--border)"}`,
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

/** 채널 한 줄: 파형 + 재생된 부분 강조 + 선택 구간 + 재생 헤드. 클릭하면 그 위치로 */
function Lane(props: {
  peaks: number[] | null;
  /** 이 채널 길이가 전체 타임라인에서 차지하는 비율(%) */
  widthPct: number;
  posPct: number;
  range: { left: number; width: number } | null;
  silent: boolean;
  label: string;
  /** 판정색 구간 (리포트 화면). 있으면 재생 진행 강조 대신 구간마다 판정색으로 칠한다 */
  bands?: Band[];
  selectedBand?: number | null;
  onBand?: (index: number) => void;
  totalMs: number;
  durationMs: number;
  onSeek: (ratio: number) => void;
  children?: ReactNode;
}) {
  const { peaks, widthPct, posPct, range, bands } = props;
  // 파형 영역 기준 재생 진행률
  const played = Math.max(0, Math.min(100, (posPct / widthPct) * 100));
  return (
    <div
      className={styles.lane}
      data-silent={props.silent || undefined}
      aria-label={`${props.label} 파형`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        props.onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
      }}
    >
      {range && <div className={styles.laneRange} style={{ left: `${range.left}%`, width: `${range.width}%` }} />}
      {bands?.map((b) => (
        <button
          key={b.index}
          type="button"
          className={styles.band}
          data-selected={props.selectedBand === b.index || undefined}
          title={`소절 ${b.index + 1}`}
          aria-label={`소절 ${b.index + 1} 선택`}
          onClick={(e) => { e.stopPropagation(); props.onBand?.(b.index); }}
          style={{
            left: `${(b.startMs / props.totalMs) * 100}%`,
            width: `${((b.endMs - b.startMs) / props.totalMs) * 100}%`,
            "--band": VERDICT_COLOR[b.verdict],
          } as CSSProperties}
        />
      ))}
      <div className={styles.wave} style={{ width: `${widthPct}%` }}>
        {peaks?.length ? (
          bands ? (
            <>
              <WavePath peaks={peaks} className={styles.waveBase} />
              {bands.map((b) => (
                <WavePath
                  key={b.index}
                  peaks={peaks}
                  className={styles.waveBand}
                  crop={[b.startMs / props.durationMs, b.endMs / props.durationMs]}
                  style={{ "--band": VERDICT_COLOR[b.verdict] } as CSSProperties}
                />
              ))}
            </>
          ) : (
            <>
              <WavePath peaks={peaks} className={styles.waveBase} />
              <WavePath peaks={peaks} className={styles.wavePlayed} style={{ clipPath: `inset(0 ${100 - played}% 0 0)` }} />
            </>
          )
        ) : (
          <div className={peaks ? styles.waveFlat : styles.wavePending} />
        )}
      </div>
      {props.children}
      <div className={styles.playhead} style={{ left: `${posPct}%` }} />
    </div>
  );
}

interface Band {
  index: number;
  startMs: number;
  endMs: number;
  verdict: Verdict;
}

/**
 * 위아래 대칭 파형. viewBox 를 피크 수에 맞추고 가로로 늘린다.
 * crop=[0~1, 0~1] 이면 그 비율 구간만 잘라 같은 위치에 그린다 (판정색 구간)
 */
function WavePath({ peaks, className, style, crop }: { peaks: number[]; className: string; style?: CSSProperties; crop?: [number, number] }) {
  const d = useMemo(() => {
    const top = peaks.map((p, i) => `${i + 0.5},${(50 - Math.max(p, 0.01) * 48).toFixed(1)}`);
    const bottom = peaks.map((p, i) => `${i + 0.5},${(50 + Math.max(p, 0.01) * 48).toFixed(1)}`).reverse();
    return `M0,50 L${top.join(" L")} L${peaks.length},50 L${bottom.join(" L")} Z`;
  }, [peaks]);
  const [from, to] = crop ?? [0, 1];
  const x = Math.max(0, from) * peaks.length;
  const w = Math.max(0.5, (Math.min(1, to) - Math.max(0, from)) * peaks.length);
  return (
    <svg
      className={className}
      style={crop ? { ...style, left: `${Math.max(0, from) * 100}%`, width: `${(w / peaks.length) * 100}%` } : style}
      viewBox={`${x} 0 ${w} 100`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} />
    </svg>
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
      style={{ position: "relative", height: 44, background: "var(--surface-2)", borderRadius: 4, cursor: "pointer", touchAction: "none", userSelect: "none" }}
    >
      {shown && (
        <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(shown.startMs), width: pct(shown.endMs - shown.startMs), background: "var(--accent-soft)", borderLeft: "1px solid var(--accent)", borderRight: "1px solid var(--accent)" }} />
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
      <div style={{ position: "absolute", top: 0, bottom: 0, left: pct(posMs), width: 2, background: "var(--highlight)", pointerEvents: "none" }} />
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
    <section style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 6, display: "grid", gap: 8 }}>
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
        {error && <small style={{ color: "var(--danger)" }}>에러: {error}</small>}
      </div>
    </section>
  );
}

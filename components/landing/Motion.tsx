import type { CSSProperties } from "react";
import s from "./landing.module.css";

// 랜딩용 루프 모션. 모두 CSS 애니메이션이라 서버 컴포넌트로 렌더된다

type Vars = CSSProperties & Record<`--${string}`, string | number>;

// 시드 고정 의사난수: 서버·클라이언트가 같은 막대 높이를 그리게
function bars(seed: number, n: number): number[] {
  let x = seed;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const r = x / 233280;
    const env = Math.sin((i / n) * Math.PI * 3 + seed) * 0.35 + 0.6;
    out.push(Math.round(Math.max(0.12, Math.min(1, env * (0.45 + r * 0.7))) * 100));
  }
  return out;
}

const HERO_ROWS = [
  { name: "가이드", off: 0, color: "var(--l-hl)" },
  { name: "소프라노", off: -38, color: "var(--l-accent-text)" },
  { name: "알토", off: 52, color: "var(--l-accent-text)" },
  { name: "테너", off: -20, color: "var(--l-accent-text)" },
  { name: "베이스", off: 30, color: "var(--l-accent-text)" },
];

export function HeroWaves() {
  return (
    <div className={s.heroWaves} aria-hidden="true">
      <div className={s.heroWavesHead}>
        <span className={s.mono}>00:42.180</span>
        <span className={s.syncBadge}>
          <span className={s.syncDot} /> SYNC
        </span>
      </div>
      {HERO_ROWS.map((row, i) => (
        <div key={row.name} className={s.waveRow}>
          <span className={s.waveName}>{row.name}</span>
          <div className={s.waveTrack}>
            <div
              className={s.waveBars}
              style={{ "--off": `${row.off}px`, "--c": row.color, animationDelay: `${i * 60}ms` } as Vars}
            >
              {bars(i * 7 + 3, 56).map((h, j) => (
                <i key={j} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
      ))}
      <div className={s.heroPlayhead} />
    </div>
  );
}

// 음 하나 = [시작x, 끝x, y]. 소절 4개
const NOTES: [number, number, number][] = [
  [8, 40, 92], [44, 70, 76], [74, 82, 70],
  [92, 120, 62], [124, 150, 54], [154, 162, 62],
  [172, 196, 48], [200, 226, 40], [230, 242, 52],
  [252, 278, 70], [282, 300, 82], [304, 316, 92],
];

function notePath(dy: (i: number) => number, dx: (i: number) => number): string {
  return NOTES.map(([a, b, y], i) => {
    const yy = y + dy(i);
    const xa = a + dx(i);
    const xb = b + dx(i);
    return `${i === 0 ? "M" : "L"}${xa} ${yy} L${xb} ${yy}`;
  }).join(" ");
}

const GUIDE = notePath(() => 0, () => 0);
// 2소절은 조금 낮게(보정 가능), 4소절은 많이 낮고 늦게(재녹음)
const TAKE = notePath(
  (i) => (i >= 3 && i < 6 ? 6 : i >= 9 ? 15 : i % 2 ? 1 : -1),
  (i) => (i >= 9 ? 7 : 0),
);

const PHRASES = [
  { label: "OK", tone: "ok" },
  { label: "보정 가능", tone: "fixable" },
  { label: "OK", tone: "ok" },
  { label: "재녹음", tone: "rerecord" },
] as const;

export function PitchLoop() {
  return (
    <div className={s.demo} aria-hidden="true">
      <svg viewBox="0 0 324 120" className={s.pitchSvg}>
        {[24, 48, 72, 96].map((y) => (
          <line key={y} x1="0" x2="324" y1={y} y2={y} className={s.gridLine} />
        ))}
        {[86, 166, 246].map((x) => (
          <line key={x} x1={x} x2={x} y1="8" y2="112" className={s.barLine} />
        ))}
        <rect x="88" y="30" width="76" height="50" rx="6" className={s.flagFixable} />
        <rect x="248" y="54" width="74" height="56" rx="6" className={s.flagRerecord} />
        <path d={GUIDE} className={s.guidePath} />
        <path d={TAKE} className={s.takePath} pathLength={1} />
      </svg>
      <div className={s.phraseRow}>
        {PHRASES.map((p, i) => (
          <span key={i} className={`${s.chip} ${s[p.tone]}`} style={{ animationDelay: `${0.5 + i * 0.55}s` }}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}

const CHANNELS = ["INST", "소프", "알토", "테너", "베이스"];

export function MixerLoop() {
  return (
    <div className={`${s.demo} ${s.mixer}`} aria-hidden="true">
      {CHANNELS.map((c, i) => (
        <div key={c} className={s.channel}>
          <div className={s.meter}>
            <i style={{ animationDelay: `${-i * 0.37}s`, animationDuration: `${0.9 + (i % 3) * 0.23}s` }} />
          </div>
          <div className={s.fader}>
            <span className={s.faderKnob} style={{ animationDelay: `${-i * 1.1}s` }} />
          </div>
          <div className={s.chBtns}>
            <b className={i === 2 ? s.soloOn : undefined}>S</b>
            <b className={i === 4 ? s.muteOn : undefined}>M</b>
          </div>
          <span className={s.chName}>{c}</span>
        </div>
      ))}
    </div>
  );
}

const PINS = [
  { at: 18, text: "여기 숨소리 커요" },
  { at: 47, text: "2절 들어가기 반 박 빨라요" },
  { at: 76, text: "끝음 조금만 더 길게!" },
];

export function FeedbackLoop() {
  return (
    <div className={s.demo} aria-hidden="true">
      <div className={s.fbTrack}>
        <div className={s.fbBars}>
          {bars(11, 64).map((h, j) => (
            <i key={j} style={{ height: `${h}%` }} />
          ))}
        </div>
        {PINS.map((p, i) => (
          <span key={i} className={s.fbRange} style={{ left: `${p.at}%`, animationDelay: `${0.8 + i * 1.3}s` }} />
        ))}
        <span className={s.fbHead} />
      </div>
      <div className={s.fbComments}>
        {PINS.map((p, i) => (
          <div key={i} className={s.fbComment} style={{ animationDelay: `${0.8 + i * 1.3}s` }}>
            <span className={s.mono}>{`0${Math.floor((p.at * 2.4) / 60)}:${String(Math.floor((p.at * 2.4) % 60)).padStart(2, "0")}`}</span>
            {p.text}
          </div>
        ))}
      </div>
    </div>
  );
}

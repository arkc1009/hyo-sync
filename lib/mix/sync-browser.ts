"use client";

import { energyEnvelope, estimateOffsetFromEnvelope, type SyncEstimate } from "@/lib/analysis/sync";

// 브라우저 전용. 가이드와 녹음 파일을 디코딩해 에너지 엔벨로프로 시작 싱크를 찾는다. 서버 컴포넌트에서 import 금지

/** 레벨 곡선만 볼 거라 낮은 샘플레이트로 디코딩 (lib/mix/peaks-browser.ts 와 같은 이유) */
const DECODE_RATE = 8000;

async function envelopeOf(data: ArrayBuffer) {
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
  const buf = await ctx.decodeAudioData(data);
  const mono = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += ch[i];
  }
  return energyEnvelope(mono, DECODE_RATE);
}

/** audioSrc() 경로에서 받기. 서명 URL 리다이렉트가 CORS 로 막히면 같은 출처 스트리밍(stream=1)으로 */
async function fetchAudio(src: string) {
  const res = await fetch(src).catch(() => fetch(`${src}&stream=1`));
  if (!res.ok) throw new Error(`오디오를 받지 못했어요 (${res.status})`);
  return res.arrayBuffer();
}

/** 가이드(audioSrc 경로) 기준으로 녹음(파일 또는 audioSrc 경로)의 시작 오프셋. 실패하면 null */
export async function detectSyncOffset(guideSrc: string, recording: File | string): Promise<SyncEstimate | null> {
  try {
    const [g, s] = await Promise.all([
      fetchAudio(guideSrc).then(envelopeOf),
      (typeof recording === "string" ? fetchAudio(recording) : recording.arrayBuffer()).then(envelopeOf),
    ]);
    return estimateOffsetFromEnvelope(g, s);
  } catch (e) {
    console.warn("싱크 자동 탐색 실패", e);
    return null;
  }
}

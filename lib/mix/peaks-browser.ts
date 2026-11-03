"use client";

import { computePeaks } from "./peaks";

// 브라우저 전용. 오디오를 디코딩해 파형 피크를 만든다. 서버 컴포넌트에서 import 금지

/** 피크만 볼 거라 낮은 샘플레이트로 디코딩해 메모리를 아낀다 (4분 곡 ≈ 2M 샘플) */
const DECODE_RATE = 8000;

export async function peaksFromAudioData(data: ArrayBuffer): Promise<number[]> {
  // OfflineAudioContext 는 사용자 제스처 없이도 쓸 수 있고, decodeAudioData 가 컨텍스트 샘플레이트로 리샘플한다
  const ctx = new OfflineAudioContext(1, 1, DECODE_RATE);
  const buffer = await ctx.decodeAudioData(data);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  return computePeaks(channels);
}

export async function peaksFromFile(file: File): Promise<number[] | null> {
  try {
    return await peaksFromAudioData(await file.arrayBuffer());
  } catch {
    // 파형은 부가 정보라 실패해도 업로드는 계속한다
    return null;
  }
}

/**
 * 이미 올라간 트랙(피크 없음)의 피크를 만들어 서버에 저장한다.
 * src 는 audioSrc() 경로. 서명 URL 리다이렉트가 CORS 로 막히면 같은 출처 스트리밍(stream=1)으로 다시 받는다
 */
export async function backfillPeaks(blobUrl: string, src: string): Promise<number[] | null> {
  try {
    const res = await fetch(src).catch(() => fetch(`${src}&stream=1`));
    if (!res.ok) return null;
    const peaks = await peaksFromAudioData(await res.arrayBuffer());
    void fetch("/api/peaks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blobUrl, peaks }),
    }).catch(() => {});
    return peaks;
  } catch {
    return null;
  }
}

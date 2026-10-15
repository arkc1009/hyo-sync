// 브라우저 전용. File → 16kHz 모노 Float32Array
// OfflineAudioContext 의 decodeAudioData 가 컨텍스트 sampleRate 로 리샘플까지 해 준다 (Phase 0 확인)

export const SAMPLE_RATE = 16000;

export interface DecodedAudio {
  samples: Float32Array;
  durationMs: number;
}

export async function decodeTo16kMono(file: Blob): Promise<DecodedAudio> {
  const ab = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(ab);
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  if (buf.numberOfChannels > 1) for (let i = 0; i < n; i++) out[i] /= buf.numberOfChannels;
  return { samples: out, durationMs: Math.round((n / SAMPLE_RATE) * 1000) };
}

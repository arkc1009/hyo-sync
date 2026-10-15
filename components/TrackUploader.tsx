"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExtractProgress } from "@/lib/pitch";

interface Props {
  parts: { id: string; name: string }[];
  /** guide = 담당자 가이드, submission = 멤버 녹음본 */
  kind: "guide" | "submission";
}

type Status =
  | { kind: "idle" }
  | { kind: "extract"; progress: ExtractProgress; backend?: string }
  | { kind: "upload"; pct: number }
  | { kind: "save" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const STAGE_LABEL: Record<ExtractProgress["stage"], string> = {
  decode: "디코딩",
  model: "모델 로딩",
  pitch: "피치 추출",
};

const ENDPOINT = { guide: "/api/guides", submission: "/api/submissions" } as const;
const BUTTON = { guide: "가이드 업로드", submission: "녹음본 제출" } as const;

/** 파트 선택 → 브라우저 피치 추출 → Blob 업로드 → API 저장 */
export default function TrackUploader({ parts, kind }: Props) {
  const router = useRouter();
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "extract" || status.kind === "upload" || status.kind === "save";

  async function run() {
    if (!file || !partId) return;
    const t0 = performance.now();
    try {
      const { extractPitch } = await import("@/lib/pitch");
      const { track, durationMs } = await extractPitch(file, (progress) => setStatus({ kind: "extract", progress }));
      const extractMs = performance.now() - t0;

      setStatus({ kind: "upload", pct: 0 });
      const { upload } = await import("@vercel/blob/client");
      // Blob 경로는 ASCII 만. 한글·공백 파일명은 멀티파트 생성(mpu)에서 400 이 난다
      const blob = await upload(`${kind}s/${partId}/${Date.now()}.${safeExt(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({ kind, partId }),
        multipart: true, // 큰 wav 를 병렬 청크로
        onUploadProgress: ({ percentage }) => setStatus({ kind: "upload", pct: percentage }),
      });

      setStatus({ kind: "save" });
      const res = await fetch(ENDPOINT[kind], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partId, blobUrl: blob.url, durationMs, pitch: track, extractMs: Math.round(extractMs) }),
      });
      const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      setStatus({ kind: "done" });
      setFile(null);
      if (kind === "submission" && json.id) router.push(`/submissions/${json.id}`);
      else router.refresh();
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
      <label>
        파트{" "}
        <select value={partId} onChange={(e) => setPartId(e.target.value)} disabled={busy}>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <input type="file" accept="audio/*" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={run} disabled={busy || !file || !partId}>
        {BUTTON[kind]}
      </button>
      <StatusLine status={status} />
    </div>
  );
}

/** "효이 듀엣.WAV" → "wav". 확장자가 없거나 이상하면 "bin" */
function safeExt(name: string) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : "bin";
}

function StatusLine({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle": return null;
    case "extract": {
      const { stage, value } = status.progress;
      return <small>{STAGE_LABEL[stage]}{stage === "pitch" ? ` ${Math.round(value * 100)}%` : "…"}</small>;
    }
    case "upload": return <small>업로드 중… {Math.round(status.pct)}%</small>;
    case "save": return <small>저장·분석 중…</small>;
    case "done": return <small>완료</small>;
    case "error": return <small style={{ color: "crimson" }}>에러: {status.message}</small>;
  }
}

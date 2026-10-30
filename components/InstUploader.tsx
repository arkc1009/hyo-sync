"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status =
  | { kind: "idle" }
  | { kind: "upload"; pct: number }
  | { kind: "save" }
  | { kind: "error"; message: string };

const MULTIPART_MIN_BYTES = 100 * 1024 * 1024;

/** INST(반주) 업로드. 피치 추출 없이 길이만 읽고 Blob 업로드 → /api/instrumentals */
export default function InstUploader({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "upload" || status.kind === "save";

  async function run() {
    if (!file) return;
    try {
      const durationMs = await readDurationMs(file);
      setStatus({ kind: "upload", pct: 0 });
      const { upload } = await import("@vercel/blob/client");
      // 경로 ASCII·멀티파트 기준은 TrackUploader 와 같다
      const blob = await upload(`insts/${projectId}/${Date.now()}.${safeExt(file.name)}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({ kind: "inst", projectId }),
        multipart: file.size >= MULTIPART_MIN_BYTES,
        onUploadProgress: ({ percentage }) => setStatus({ kind: "upload", pct: percentage }),
      });

      setStatus({ kind: "save" });
      const res = await fetch("/api/instrumentals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, blobUrl: blob.url, durationMs }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? res.statusText);

      setStatus({ kind: "idle" });
      setFile(null);
      router.refresh();
    } catch (e) {
      setStatus({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input type="file" accept="audio/*" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={run} disabled={busy || !file}>INST 업로드</button>
      {status.kind === "upload" && <small>업로드 중… {Math.round(status.pct)}%</small>}
      {status.kind === "save" && <small>저장 중…</small>}
      {status.kind === "error" && <small style={{ color: "crimson" }}>에러: {status.message}</small>}
    </div>
  );
}

/** 전체 디코딩 없이 메타데이터로 길이만 */
function readDurationMs(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(el.duration) && el.duration > 0) resolve(Math.round(el.duration * 1000));
      else reject(new Error("오디오 길이를 읽지 못했어요"));
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("브라우저가 읽을 수 없는 오디오 형식이에요"));
    };
    el.src = url;
  });
}

function safeExt(name: string) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : "bin";
}

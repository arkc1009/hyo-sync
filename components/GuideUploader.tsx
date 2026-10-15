"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExtractProgress } from "@/lib/pitch";

interface Props {
  parts: { id: string; name: string }[];
}

type Status =
  | { kind: "idle" }
  | { kind: "extract"; progress: ExtractProgress }
  | { kind: "upload" }
  | { kind: "save" }
  | { kind: "done" }
  | { kind: "error"; message: string };

const STAGE_LABEL: Record<ExtractProgress["stage"], string> = {
  decode: "디코딩",
  model: "모델 로딩",
  pitch: "피치 추출",
};

/** 파트 선택 → 브라우저 피치 추출 → Blob 업로드 → /api/guides */
export default function GuideUploader({ parts }: Props) {
  const router = useRouter();
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "extract" || status.kind === "upload" || status.kind === "save";

  async function run() {
    if (!file || !partId) return;
    try {
      const { extractPitch } = await import("@/lib/pitch");
      const { track, durationMs } = await extractPitch(file, (progress) => setStatus({ kind: "extract", progress }));

      setStatus({ kind: "upload" });
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(`guides/${partId}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify({ kind: "guide", partId }),
      });

      setStatus({ kind: "save" });
      const res = await fetch("/api/guides", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ partId, blobUrl: blob.url, durationMs, pitch: track }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);

      setStatus({ kind: "done" });
      setFile(null);
      router.refresh();
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
        가이드 업로드
      </button>
      <StatusLine status={status} />
    </div>
  );
}

function StatusLine({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle": return null;
    case "extract": {
      const { stage, value } = status.progress;
      return <small>{STAGE_LABEL[stage]}{stage === "pitch" ? ` ${Math.round(value * 100)}%` : "…"}</small>;
    }
    case "upload": return <small>업로드 중…</small>;
    case "save": return <small>저장 중…</small>;
    case "done": return <small>완료</small>;
    case "error": return <small style={{ color: "crimson" }}>에러: {status.message}</small>;
  }
}

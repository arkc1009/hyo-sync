"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BLOB_ACCESS } from "@/lib/blob";

type Target =
  /** 담당자 INST */
  | { kind: "inst"; projectId: string }
  /** 멤버 트랙. 가이드 비교 없이 믹서·피드백용 */
  | { kind: "track"; parts: { id: string; name: string }[] };

type Status =
  | { kind: "idle" }
  | { kind: "upload"; mb: string }
  | { kind: "save" }
  | { kind: "error"; message: string };

const MULTIPART_MIN_BYTES = 100 * 1024 * 1024;

/** 피치 추출 없이 길이만 읽고 Blob 업로드 → API 저장. INST 와 믹스용 트랙 */
export default function QuickUploader({ target }: { target: Target }) {
  const router = useRouter();
  const parts = target.kind === "track" ? target.parts : [];
  const [partId, setPartId] = useState(parts[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const busy = status.kind === "upload" || status.kind === "save";
  const ready = !!file && (target.kind === "inst" || !!partId);

  async function run() {
    if (!file || !ready) return;
    try {
      const durationMs = await readDurationMs(file);
      setStatus({ kind: "upload", mb: (file.size / 1024 / 1024).toFixed(1) });
      const { upload } = await import("@vercel/blob/client");
      // 경로 ASCII·멀티파트 기준, private access, 진행률 콜백 없음은 TrackUploader 와 같다.
      // onUploadProgress 를 주면 SDK 가 스트리밍 업로드를 하는데 Chrome 은 HTTP/2 에서만 허용해 http/1.1 환경에서 실패한다
      const [path, payload] = target.kind === "inst"
        ? [`insts/${target.projectId}`, { kind: "inst", projectId: target.projectId }]
        : [`submissions/${partId}`, { kind: "submission", partId }];
      const blob = await upload(`${path}/${Date.now()}.${safeExt(file.name)}`, file, {
        access: BLOB_ACCESS,
        handleUploadUrl: "/api/blob/upload",
        clientPayload: JSON.stringify(payload),
        multipart: file.size >= MULTIPART_MIN_BYTES,
      });

      setStatus({ kind: "save" });
      const res = await fetch(target.kind === "inst" ? "/api/instrumentals" : "/api/submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          target.kind === "inst"
            ? { projectId: target.projectId, blobUrl: blob.url, durationMs }
            : { partId, blobUrl: blob.url, durationMs, mixOnly: true },
        ),
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
      {target.kind === "track" && (
        <label>
          파트{" "}
          <select value={partId} onChange={(e) => setPartId(e.target.value)} disabled={busy}>
            {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <input type="file" accept="audio/*" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={run} disabled={busy || !ready}>{target.kind === "inst" ? "INST 업로드" : "트랙 올리기"}</button>
      {status.kind === "upload" && <small>업로드 중… ({status.mb} MB)</small>}
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

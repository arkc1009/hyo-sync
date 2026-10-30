import Link from "next/link";
import { notFound } from "next/navigation";
import ReportView from "@/components/ReportView";
import { THRESHOLDS } from "@/lib/analysis/thresholds";
import type { PhraseResult, ReportSummary } from "@/lib/analysis/types";
import { audioSrc } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { formatMs, formatOffset } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function SubmissionPage({ params }: PageProps<"/submissions/[id]">) {
  const { id } = await params;
  const user = await requireUser();

  const sub = await prisma.submission.findFirst({
    where: { id, part: { project: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] } } },
    include: {
      user: { select: { name: true, email: true } },
      part: { include: { project: { select: { id: true, title: true } } } },
      report: { include: { guideTrack: { select: { blobUrl: true, durationMs: true, createdAt: true } } } },
    },
  });
  if (!sub) notFound();

  const who = sub.userId === user.id ? "내" : (sub.user.name ?? sub.user.email);

  return (
    <main>
      <p><Link href={`/projects/${sub.part.project.id}`}>← {sub.part.project.title}</Link></p>
      <h1>{sub.part.name} · {who} 녹음 · 테이크 {sub.take}</h1>
      <p>
        <small>{formatMs(sub.durationMs)} · {sub.createdAt.toLocaleString("ko-KR")}</small>
      </p>

      {sub.status === "FAILED" || !sub.report ? (
        <p style={{ color: "crimson" }}>분석에 실패했어요. 다시 제출해 보세요.</p>
      ) : (
        <Report
          summary={sub.report.summary as unknown as ReportSummary}
          phrases={sub.report.phrases as unknown as PhraseResult[]}
          globalOffsetMs={sub.report.globalOffsetMs}
          guideUrl={audioSrc(sub.report.guideTrack.blobUrl)}
          guideDurationMs={sub.report.guideTrack.durationMs}
          subUrl={audioSrc(sub.blobUrl)}
        />
      )}

      <p style={{ marginTop: 24 }}>
        <Link href={`/projects/${sub.part.project.id}/submit`}>다시 제출</Link>
      </p>
    </main>
  );
}

function Report(props: {
  summary: ReportSummary;
  phrases: PhraseResult[];
  globalOffsetMs: number;
  guideUrl: string;
  guideDurationMs: number;
  subUrl: string;
}) {
  const { summary, phrases, globalOffsetMs } = props;
  const notice = Math.abs(globalOffsetMs) >= THRESHOLDS.globalOffsetNoticeMs;
  return (
    <>
      <section style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0" }}>
        <Stat label="재녹음" value={summary.rerecord} color="#e5484d" />
        <Stat label="보정 가능" value={summary.fixable} color="#f0b429" />
        <Stat label="OK" value={summary.ok} color="#3cb371" />
        <Stat label="판정 불가" value={summary.unreliable} color="#9a9a9a" />
      </section>
      {notice && (
        <p style={{ padding: 8, background: "#f0b42922", borderRadius: 6 }}>
          전체적으로 <strong>{formatOffset(globalOffsetMs)}</strong>. 시작점이 밀린 채 녹음됐을 수 있어요 — 가이드와 시작을 맞춰서 다시 올리면 타이밍 판정이 정확해져요.
        </p>
      )}
      {phrases.length === 0 ? (
        <p>가이드에서 소절을 찾지 못했어요 (유성 구간 없음).</p>
      ) : (
        <ReportView phrases={phrases} guideUrl={props.guideUrl} subUrl={props.subUrl} guideDurationMs={props.guideDurationMs} />
      )}
    </>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ minWidth: 80 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      <small>{label}</small>
    </div>
  );
}

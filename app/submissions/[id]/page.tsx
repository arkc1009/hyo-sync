import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import Mixer, { type MixChannel } from "@/components/Mixer";
import { Badge, ButtonLink, Card, Notice, PageHeader } from "@/components/ui";
import { submissionWhereForUser } from "@/lib/access";
import { THRESHOLDS } from "@/lib/analysis/thresholds";
import type { PhraseResult, ReportSummary, Verdict } from "@/lib/analysis/types";
import { audioSrc } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { formatMs, formatOffset } from "@/lib/format";
import { VERDICT_COLOR } from "@/lib/labels";
import { validatePeaks } from "@/lib/mix/peaks";
import { formatSyncOffset } from "@/lib/mix/sync";
import { requireUser } from "@/lib/session";
import styles from "./page.module.css";

/** 녹음 하나 자세히 보기: 자동 분석(소절 판정)과 담당자 코멘트를 한 타임라인에 */
export default async function SubmissionPage({ params }: PageProps<"/submissions/[id]">) {
  const { id } = await params;
  const user = await requireUser();

  const sub = await prisma.submission.findFirst({
    where: submissionWhereForUser(id, user.id),
    omit: { pitch: true },
    include: {
      user: { select: { name: true, email: true } },
      part: {
        include: {
          project: { select: { id: true, title: true, ownerId: true } },
          guideTracks: { orderBy: { createdAt: "desc" }, take: 1, select: { blobUrl: true } },
        },
      },
      comments: { orderBy: { startMs: "asc" }, select: { id: true, submissionId: true, startMs: true, endMs: true, body: true, createdAt: true } },
      report: { include: { guideTrack: { select: { blobUrl: true, durationMs: true, peaks: true } } } },
    },
  });
  if (!sub) notFound();

  const mine = sub.userId === user.id;
  const who = mine ? "내" : (sub.user.name ?? sub.user.email);
  const isOwner = sub.part.project.ownerId === user.id;
  const mixOnly = sub.status === "MIX_ONLY";
  const report = !mixOnly && sub.status !== "FAILED" ? sub.report : null;
  const phrases = report ? (report.phrases as unknown as PhraseResult[]) : undefined;
  const inst = await prisma.instrumental.findFirst({ where: { projectId: sub.part.project.id }, orderBy: { createdAt: "desc" } });

  const channels: MixChannel[] = [
    {
      id: sub.id,
      label: mine ? "내 녹음" : `${who} 녹음`,
      url: audioSrc(sub.blobUrl),
      blobUrl: sub.blobUrl,
      peaks: validatePeaks(sub.peaks),
      durationMs: sub.durationMs,
      submissionId: sub.id,
      role: "mine",
      offsetMs: sub.syncOffsetMs,
      sync: {
        editable: mine || isOwner,
        savedMs: sub.syncOffsetMs,
        autoMs: sub.syncAutoMs,
        confidence: sub.syncConfidence,
        detect: !mixOnly
          ? { kind: "server" }
          : sub.part.guideTracks[0]
            ? { kind: "client", guideSrc: audioSrc(sub.part.guideTracks[0].blobUrl) }
            : null,
      },
    },
    ...(report
      ? [{
          id: `guide-${report.guideTrackId}`,
          label: "가이드",
          url: audioSrc(report.guideTrack.blobUrl),
          blobUrl: report.guideTrack.blobUrl,
          peaks: validatePeaks(report.guideTrack.peaks),
          durationMs: report.guideTrack.durationMs,
          role: "guide" as const,
          initiallyMuted: true,
        }]
      : []),
    ...(inst
      ? [{ id: `inst-${inst.id}`, label: "INST", url: audioSrc(inst.blobUrl), blobUrl: inst.blobUrl, peaks: validatePeaks(inst.peaks), durationMs: inst.durationMs }]
      : []),
  ];
  const comments = sub.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }));

  const project = sub.part.project;
  return (
    <>
      <PageHeader
        back={{ href: `/projects/${project.id}`, label: project.title }}
        title={<>{sub.part.name} · {who} 녹음</>}
        meta={
          <span className={styles.meta}>
            <Badge tone="neutral">테이크 {sub.take}</Badge>
            {mixOnly && <Badge tone="neutral">믹스용</Badge>}
            {comments.length > 0 && <Badge tone="accent">담당자 코멘트 {comments.length}</Badge>}
            <span className="mono">{formatMs(sub.durationMs)}</span>
            <span>{sub.createdAt.toLocaleString("ko-KR")}</span>
          </span>
        }
        actions={<ButtonLink href={`/projects/${project.id}/${mixOnly ? "mix" : "submit"}`}>다시 올리기</ButtonLink>}
      />

      <div className={styles.stack}>
        {report && <Summary summary={report.summary as unknown as ReportSummary} globalOffsetMs={report.globalOffsetMs} />}
        {sub.syncConfidence != null && <SyncNotice offsetMs={sub.syncOffsetMs} autoMs={sub.syncAutoMs} />}
        {!mixOnly && !report && <Notice tone="error">자동 분석에 실패했어요. 다시 제출해 보세요. 담당자 코멘트는 아래에서 볼 수 있어요.</Notice>}

        <Card
          title="타임라인"
          description={
            report
              ? "파형 색은 소절 판정이에요. 소절을 누르면 가이드와 내 녹음을 번갈아 들을 수 있고, 보라색 표시는 담당자 코멘트예요."
              : mixOnly
                ? "가이드 비교 없이 믹서·피드백용으로 올린 트랙이에요. 보라색 표시는 담당자 코멘트예요."
                : "보라색 표시는 담당자 코멘트예요."
          }
        >
          {phrases?.length === 0 && <p className="muted">가이드에서 소절을 찾지 못했어요 (유성 구간 없음).</p>}
          <Mixer channels={channels} comments={comments} canComment={isOwner} phrases={phrases} />
        </Card>
      </div>
    </>
  );
}

function Summary({ summary, globalOffsetMs }: { summary: ReportSummary; globalOffsetMs: number }) {
  const notice = Math.abs(globalOffsetMs) >= THRESHOLDS.globalOffsetNoticeMs;
  return (
    <div className={styles.report}>
      <div className={styles.stats}>
        <Stat label="재녹음" value={summary.rerecord} verdict="RERECORD" />
        <Stat label="보정 가능" value={summary.fixable} verdict="FIXABLE" />
        <Stat label="OK" value={summary.ok} verdict="OK" />
        <Stat label="판정 불가" value={summary.unreliable} verdict="UNRELIABLE" />
      </div>
      {notice && (
        <Notice tone="warning">
          전체적으로 <strong>{formatOffset(globalOffsetMs)}</strong>. 시작 싱크를 맞춘 뒤에도 전체가 밀려 있어요. 아래 타임라인의 &lsquo;싱크&rsquo;에서 조정하면 다시 판정해요.
        </Notice>
      )}
    </div>
  );
}

function Stat({ label, value, verdict }: { label: string; value: number; verdict: Verdict }) {
  return (
    <div className={styles.stat} style={{ "--tone": VERDICT_COLOR[verdict] } as CSSProperties}>
      <span className={`${styles.statValue} mono`}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

/** 시작 싱크 안내. 자동으로 맞췄으면 얼마나 옮겼는지, 못 찾았으면 직접 조정 안내 */
function SyncNotice({ offsetMs, autoMs }: { offsetMs: number; autoMs: number | null }) {
  if (autoMs == null && offsetMs === 0) {
    return (
      <Notice tone="warning">
        가이드와 시작점을 자동으로 맞추지 못했어요. 아래 타임라인의 &lsquo;싱크&rsquo;에서 직접 조정할 수 있어요.
      </Notice>
    );
  }
  if (offsetMs === 0) return null;
  return (
    <Notice tone="info">
      시작점이 가이드와 <strong className="mono">{formatSyncOffset(offsetMs)}</strong> 어긋나 있어서 {offsetMs === autoMs ? "자동으로" : "직접 조정한 값으로"} 맞춘 뒤 비교·재생해요.
    </Notice>
  );
}

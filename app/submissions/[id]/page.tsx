import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import Mixer, { type MixChannel } from "@/components/Mixer";
import ReportView from "@/components/ReportView";
import { Badge, ButtonLink, Card, Notice, PageHeader } from "@/components/ui";
import { submissionWhereForUser } from "@/lib/access";
import { THRESHOLDS } from "@/lib/analysis/thresholds";
import type { PhraseResult, ReportSummary, Verdict } from "@/lib/analysis/types";
import { VERDICT_COLOR } from "@/lib/labels";
import { audioSrc } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { formatMs, formatOffset } from "@/lib/format";
import { requireUser } from "@/lib/session";
import styles from "./page.module.css";

export default async function SubmissionPage({ params }: PageProps<"/submissions/[id]">) {
  const { id } = await params;
  const user = await requireUser();

  const sub = await prisma.submission.findFirst({
    where: submissionWhereForUser(id, user.id),
    include: {
      user: { select: { name: true, email: true } },
      part: { include: { project: { select: { id: true, title: true, ownerId: true } } } },
      comments: { orderBy: { startMs: "asc" }, select: { id: true, submissionId: true, startMs: true, endMs: true, body: true, createdAt: true } },
      report: { include: { guideTrack: { select: { blobUrl: true, durationMs: true, createdAt: true } } } },
    },
  });
  if (!sub) notFound();

  const who = sub.userId === user.id ? "내" : (sub.user.name ?? sub.user.email);
  const isOwner = sub.part.project.ownerId === user.id;
  const mixOnly = sub.status === "MIX_ONLY";
  const inst = await prisma.instrumental.findFirst({ where: { projectId: sub.part.project.id }, orderBy: { createdAt: "desc" } });
  const channels: MixChannel[] = [
    ...(inst ? [{ id: `inst-${inst.id}`, label: "INST", url: audioSrc(inst.blobUrl), durationMs: inst.durationMs }] : []),
    { id: sub.id, label: sub.userId === user.id ? "내 녹음" : `${who} 녹음`, url: audioSrc(sub.blobUrl), durationMs: sub.durationMs, submissionId: sub.id },
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
            <span className="mono">{formatMs(sub.durationMs)}</span>
            <span>{sub.createdAt.toLocaleString("ko-KR")}</span>
          </span>
        }
        actions={<ButtonLink href={`/projects/${project.id}/${mixOnly ? "mix" : "submit"}`}>다시 올리기</ButtonLink>}
      />

      <div className={styles.stack}>
        {!mixOnly && (
          <Card title="자동 분석 리포트" description="가이드와 소절별로 비교한 결과예요. 소절을 누르면 가이드와 내 녹음을 번갈아 들을 수 있어요.">
            {sub.status === "FAILED" || !sub.report ? (
              <Notice tone="error">분석에 실패했어요. 다시 제출해 보세요.</Notice>
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
          </Card>
        )}

        {(mixOnly || comments.length > 0 || isOwner) && (
          <Card
            title="담당자 피드백"
            description={mixOnly ? "가이드 비교 없이 믹서·피드백용으로 올린 트랙이에요." : "INST와 같이 들으며 구간별 코멘트를 확인해요."}
          >
            <Mixer channels={channels} comments={comments} canComment={isOwner} />
          </Card>
        )}
      </div>
    </>
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
    <div className={styles.report}>
      <div className={styles.stats}>
        <Stat label="재녹음" value={summary.rerecord} verdict="RERECORD" />
        <Stat label="보정 가능" value={summary.fixable} verdict="FIXABLE" />
        <Stat label="OK" value={summary.ok} verdict="OK" />
        <Stat label="판정 불가" value={summary.unreliable} verdict="UNRELIABLE" />
      </div>
      {notice && (
        <Notice tone="warning">
          전체적으로 <strong>{formatOffset(globalOffsetMs)}</strong>. 시작점이 밀린 채 녹음됐을 수 있어요. 가이드와 시작을 맞춰서 다시 올리면 타이밍 판정이 정확해져요.
        </Notice>
      )}
      {phrases.length === 0 ? (
        <p className="muted">가이드에서 소절을 찾지 못했어요 (유성 구간 없음).</p>
      ) : (
        <ReportView phrases={phrases} guideUrl={props.guideUrl} subUrl={props.subUrl} guideDurationMs={props.guideDurationMs} />
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

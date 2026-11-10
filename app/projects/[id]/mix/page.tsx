import { notFound } from "next/navigation";
import Mixer, { type MixChannel } from "@/components/Mixer";
import QuickUploader from "@/components/QuickUploader";
import type { SyncInfo } from "@/components/SyncControl";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { projectForUser, visibleSubmissionsWhere } from "@/lib/access";
import { audioSrc } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { validatePeaks } from "@/lib/mix/peaks";
import { latestTakes } from "@/lib/mix";
import { requireUser } from "@/lib/session";
import styles from "./page.module.css";

/** INST + 파트·멤버별 최신 테이크를 같이 들으며 구간 코멘트 */
export default async function MixPage({ params }: PageProps<"/projects/[id]/mix">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await projectForUser(id, user.id);
  if (!project) notFound();
  const isOwner = project.ownerId === user.id;

  const inst = await prisma.instrumental.findFirst({ where: { projectId: id }, orderBy: { createdAt: "desc" } });
  const parts = await prisma.part.findMany({
    where: { projectId: id },
    orderBy: { order: "asc" },
    include: {
      guideTracks: { orderBy: { createdAt: "desc" }, take: 1, select: { blobUrl: true } },
      submissions: {
        where: visibleSubmissionsWhere(project, user.id),
        orderBy: [{ userId: "asc" }, { take: "desc" }],
        // 피치 곡선(수백 KB)은 믹서에 필요 없다
        omit: { pitch: true },
        include: {
          user: { select: { name: true, email: true } },
          comments: { orderBy: { startMs: "asc" }, select: { id: true, submissionId: true, startMs: true, endMs: true, body: true, createdAt: true } },
        },
      },
    },
  });

  const subs = latestTakes(parts.flatMap((p) => p.submissions.map((s) => ({ ...s, partName: p.name, guide: p.guideTracks[0] ?? null }))));
  const channels: MixChannel[] = [
    ...(inst ? [{ id: `inst-${inst.id}`, label: "INST", url: audioSrc(inst.blobUrl), blobUrl: inst.blobUrl, peaks: validatePeaks(inst.peaks), durationMs: inst.durationMs }] : []),
    ...subs.map((s) => ({
      id: s.id,
      label: `${s.partName} · ${s.userId === user.id ? "나" : (s.user.name ?? s.user.email)} · T${s.take}`,
      url: audioSrc(s.blobUrl),
      blobUrl: s.blobUrl,
      peaks: validatePeaks(s.peaks),
      durationMs: s.durationMs,
      submissionId: s.id,
      offsetMs: s.syncOffsetMs,
      sync: {
        editable: isOwner || s.userId === user.id,
        savedMs: s.syncOffsetMs,
        autoMs: s.syncAutoMs,
        confidence: s.syncConfidence,
        detect: syncDetect(s.status, s.guide?.blobUrl),
      },
    })),
  ];
  const comments = subs.flatMap((s) => s.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));

  return (
    <>
      <PageHeader
        back={{ href: `/projects/${id}`, label: project.title }}
        title="믹서"
        meta={
          <>
            {inst ? "INST와 " : "INST 없이 "}파트·멤버별 최신 테이크를 같이 재생해요. 녹음본 시작점은 가이드에 자동으로 맞추고, 채널의 &lsquo;싱크&rsquo;에서 직접 조정할 수 있어요.
            {isOwner && " 구간을 잡고 대상 트랙을 골라 코멘트를 남기면 멤버가 자기 제출 페이지에서 봐요."}
          </>
        }
      />
      <div className={styles.stack}>
        {subs.length === 0 ? (
          <EmptyState title="아직 올라온 녹음본이 없어요">아래에서 첫 트랙을 올려 보세요.</EmptyState>
        ) : (
          <Card>
            <Mixer channels={channels} comments={comments} canComment={isOwner} />
          </Card>
        )}
        {parts.length > 0 && (
          <Card title="트랙 올리기" description="가이드 비교 없이 바로 믹서에 올라가요. 파트에 가이드가 있으면 시작점을 가이드에 자동으로 맞춰요.">
            <QuickUploader
              target={{
                kind: "track",
                parts: parts.map((p) => ({ id: p.id, name: p.name, guideSrc: p.guideTracks[0] ? audioSrc(p.guideTracks[0].blobUrl) : null })),
              }}
            />
          </Card>
        )}
      </div>
    </>
  );
}

/** 자동 싱크 방법: 피치가 있는 제출은 서버, 믹스용 트랙은 가이드 파일과 브라우저에서 비교 */
function syncDetect(status: string, guideBlobUrl: string | undefined): SyncInfo["detect"] {
  if (status !== "MIX_ONLY") return { kind: "server" };
  return guideBlobUrl ? { kind: "client", guideSrc: audioSrc(guideBlobUrl) } : null;
}

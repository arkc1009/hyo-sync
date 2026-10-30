import Link from "next/link";
import { notFound } from "next/navigation";
import Mixer, { type MixChannel } from "@/components/Mixer";
import QuickUploader from "@/components/QuickUploader";
import { projectForUser, visibleSubmissionsWhere } from "@/lib/access";
import { audioSrc } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { latestTakes } from "@/lib/mix";
import { requireUser } from "@/lib/session";

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
      submissions: {
        where: visibleSubmissionsWhere(project, user.id),
        orderBy: [{ userId: "asc" }, { take: "desc" }],
        include: {
          user: { select: { name: true, email: true } },
          comments: { orderBy: { startMs: "asc" }, select: { id: true, submissionId: true, startMs: true, endMs: true, body: true, createdAt: true } },
        },
      },
    },
  });

  const subs = latestTakes(parts.flatMap((p) => p.submissions.map((s) => ({ ...s, partName: p.name }))));
  const channels: MixChannel[] = [
    ...(inst ? [{ id: `inst-${inst.id}`, label: "INST", url: audioSrc(inst.blobUrl), durationMs: inst.durationMs }] : []),
    ...subs.map((s) => ({
      id: s.id,
      label: `${s.partName} · ${s.userId === user.id ? "나" : (s.user.name ?? s.user.email)} · T${s.take}`,
      url: audioSrc(s.blobUrl),
      durationMs: s.durationMs,
      submissionId: s.id,
    })),
  ];
  const comments = subs.flatMap((s) => s.comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));

  return (
    <main>
      <p><Link href={`/projects/${id}`}>← {project.title}</Link></p>
      <h1>믹서</h1>
      <p>
        <small>
          {inst ? "INST와 " : "INST 없이 "}파트·멤버별 최신 테이크를 같이 재생해요. 멤버가 시작점을 맞춰 올렸다고 가정해요.
          {isOwner && " 구간을 잡고 대상 트랙을 골라 코멘트를 남기면 멤버가 자기 제출 페이지에서 봐요."}
        </small>
      </p>
      {parts.length > 0 && (
        <section style={{ margin: "12px 0 20px" }}>
          <h2 style={{ fontSize: 18 }}>트랙 올리기</h2>
          <p><small>INST와 시작점을 맞춘 녹음본. 가이드 비교 없이 바로 믹서에 올라가요.</small></p>
          <QuickUploader target={{ kind: "track", parts: parts.map((p) => ({ id: p.id, name: p.name })) }} />
        </section>
      )}
      {subs.length === 0 ? (
        <p>아직 올라온 녹음본이 없어요.</p>
      ) : (
        <Mixer channels={channels} comments={comments} canComment={isOwner} />
      )}
    </main>
  );
}

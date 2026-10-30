import { notFound } from "next/navigation";
import TrackUploader from "@/components/TrackUploader";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { projectForUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function SubmitPage({ params }: PageProps<"/projects/[id]/submit">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await projectForUser(id, user.id);
  if (!project) notFound();

  // 가이드가 있는 파트만 제출 가능
  const parts = await prisma.part.findMany({
    where: { projectId: id, guideTracks: { some: {} } },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader back={{ href: `/projects/${id}`, label: project.title }} title="녹음본 제출" meta="가이드와 비교해 소절별로 OK · 보정 가능 · 재녹음을 알려줘요." />
      {parts.length === 0 ? (
        <EmptyState title="아직 가이드가 올라온 파트가 없어요">담당자가 가이드를 올리면 제출할 수 있어요.</EmptyState>
      ) : (
        <Card
          title="내 녹음 올리기"
          description="가이드와 시작점을 맞춘 드라이 보컬(반주·리버브 없음)만. 브라우저에서 피치를 뽑은 뒤 올라가고, 끝나면 리포트로 이동해요."
        >
          <TrackUploader parts={parts} kind="submission" />
        </Card>
      )}
    </>
  );
}

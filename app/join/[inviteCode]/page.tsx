import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** 초대 링크. 로그인돼 있으면 멤버로 넣고 프로젝트로 보낸다 */
export default async function JoinPage({ params }: PageProps<"/join/[inviteCode]">) {
  const { inviteCode } = await params;
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { inviteCode }, select: { id: true } });
  if (!project) notFound();
  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: user.id } },
    update: {},
    create: { projectId: project.id, userId: user.id },
  });
  redirect(`/projects/${project.id}`);
}

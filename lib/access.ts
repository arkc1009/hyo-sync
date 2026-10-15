import { prisma } from "@/lib/db";

/** 소유자이거나 멤버인 프로젝트만. 아니면 null */
export async function projectForUser(projectId: string, userId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    },
  });
}

/** 파트가 속한 프로젝트에 접근 가능한지. 가능하면 파트(프로젝트 포함) 반환 */
export async function partForUser(partId: string, userId: string) {
  return prisma.part.findFirst({
    where: {
      id: partId,
      project: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    },
    include: { project: true },
  });
}

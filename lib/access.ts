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

/**
 * 이 사용자가 볼 수 있는 녹음본 조건 (Submission where 에 펼쳐 넣는다).
 * 담당자이거나 프로젝트가 TEAM 공개면 전부, OWN_ONLY 면 본인 것만
 */
export function visibleSubmissionsWhere(project: { ownerId: string; visibility: "TEAM" | "OWN_ONLY" }, userId: string) {
  return project.ownerId === userId || project.visibility === "TEAM" ? {} : { userId };
}

/** 제출 id 로 찾을 때의 조건: 담당자, TEAM 공개 프로젝트의 멤버, 또는 본인 녹음본 */
export function submissionWhereForUser(id: string, userId: string) {
  return { id, ...submissionVisibleTo(userId) };
}

/** 프로젝트를 모를 때(제출 id·blobUrl 로 찾을 때) 쓰는 열람 조건. visibleSubmissionsWhere 와 같은 규칙 */
export function submissionVisibleTo(userId: string) {
  return {
    part: {
      project: {
        OR: [{ ownerId: userId }, { members: { some: { userId } } }],
      },
    },
    OR: [
      { userId },
      { part: { project: { OR: [{ ownerId: userId }, { visibility: "TEAM" as const }] } } },
    ],
  };
}

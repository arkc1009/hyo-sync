"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** 파트 추가. 담당자만 */
export async function addPart(projectId: string, formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const project = await prisma.project.findFirst({ where: { id: projectId, ownerId: user.id }, select: { id: true } });
  if (!project) return;
  const last = await prisma.part.findFirst({ where: { projectId }, orderBy: { order: "desc" }, select: { order: true } });
  await prisma.part.create({ data: { projectId, name, order: (last?.order ?? -1) + 1 } });
  revalidatePath(`/projects/${projectId}`);
}

/** 파트 삭제. 담당자만. 가이드·제출도 cascade 로 사라진다 */
export async function removePart(projectId: string, partId: string) {
  const user = await requireUser();
  await prisma.part.deleteMany({ where: { id: partId, project: { id: projectId, ownerId: user.id } } });
  revalidatePath(`/projects/${projectId}`);
}

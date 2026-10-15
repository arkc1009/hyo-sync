"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  const project = await prisma.project.create({
    data: { title, ownerId: user.id, members: { create: { userId: user.id } } },
    select: { id: true },
  });
  redirect(`/projects/${project.id}`);
}

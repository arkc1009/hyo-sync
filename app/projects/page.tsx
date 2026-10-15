import Link from "next/link";
import { signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createProject } from "./actions";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true } }, _count: { select: { parts: true, members: true } } },
  });

  return (
    <main>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>프로젝트</h1>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
          <small>{user.email}</small> <button type="submit">로그아웃</button>
        </form>
      </header>

      <form action={createProject} style={{ display: "flex", gap: 8, margin: "1rem 0" }}>
        <input name="title" placeholder="곡 제목" required />
        <button type="submit">만들기</button>
      </form>

      {projects.length === 0 ? (
        <p>아직 프로젝트가 없어요. 곡 제목을 넣고 만들거나, 초대 링크로 참여하세요.</p>
      ) : (
        <ul>
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}>{p.title}</Link>{" "}
              <small>
                {p.ownerId === user.id ? "담당자" : `담당자 ${p.owner.name ?? ""}`} · 파트 {p._count.parts} · 멤버 {p._count.members}
              </small>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

import Link from "next/link";
import { Badge, Button, Card, EmptyState, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { createProject } from "./actions";
import styles from "./page.module.css";

export const metadata = { title: "프로젝트" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] },
    orderBy: { createdAt: "desc" },
    include: { owner: { select: { name: true } }, _count: { select: { parts: true, members: true } } },
  });

  return (
    <>
      <PageHeader title="프로젝트" meta="곡 하나가 프로젝트 하나예요. 파트를 나누고 멤버를 초대해 녹음본을 모아요." />

      <Card title="새 프로젝트">
        <form action={createProject} className={styles.create}>
          <input name="title" placeholder="곡 제목" required aria-label="곡 제목" />
          <Button type="submit" variant="primary">만들기</Button>
        </form>
      </Card>

      {projects.length === 0 ? (
        <div className={styles.empty}>
          <EmptyState title="아직 프로젝트가 없어요">
            곡 제목을 넣고 만들거나, 담당자에게 받은 초대 링크로 참여하세요.
          </EmptyState>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={styles.project}>
              <span className={styles.title}>{p.title}</span>
              <span className={styles.stats}>
                <span><strong>{p._count.parts}</strong> 파트</span>
                <span><strong>{p._count.members}</strong> 멤버</span>
              </span>
              <span className={styles.foot}>
                {p.ownerId === user.id ? <Badge tone="accent">담당자</Badge> : <span>담당자 {p.owner.name ?? ""}</span>}
                <span>{p.createdAt.toLocaleDateString("ko-KR")}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

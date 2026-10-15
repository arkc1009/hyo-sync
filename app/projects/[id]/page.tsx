import Link from "next/link";
import { notFound } from "next/navigation";
import GuideUploader from "@/components/GuideUploader";
import { projectForUser } from "@/lib/access";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { addPart, removePart } from "./actions";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const user = await requireUser();
  const project = await projectForUser(id, user.id);
  if (!project) notFound();
  const isOwner = project.ownerId === user.id;

  const parts = await prisma.part.findMany({
    where: { projectId: id },
    orderBy: { order: "asc" },
    include: {
      guideTracks: { orderBy: { createdAt: "desc" }, select: { id: true, blobUrl: true, durationMs: true, createdAt: true } },
      _count: { select: { submissions: true } },
    },
  });
  const members = await prisma.projectMember.findMany({ where: { projectId: id }, include: { user: { select: { name: true, email: true } } } });

  return (
    <main>
      <p><Link href="/projects">← 프로젝트</Link></p>
      <h1>{project.title}</h1>
      <p>
        <small>멤버 {members.length}명: {members.map((m) => m.user.name ?? m.user.email).join(", ")}</small>
      </p>
      {isOwner && (
        <p>
          초대 링크: <code>/join/{project.inviteCode}</code>
        </p>
      )}

      <h2>파트</h2>
      {parts.length === 0 && <p>파트가 없어요. {isOwner ? "아래에서 추가하세요." : "담당자가 추가하면 여기 보여요."}</p>}
      <ul>
        {parts.map((part) => {
          const latest = part.guideTracks[0];
          return (
            <li key={part.id} style={{ marginBottom: 12 }}>
              <strong>{part.name}</strong>{" "}
              <small>가이드 {part.guideTracks.length}개 · 제출 {part._count.submissions}개</small>
              {isOwner && (
                <form action={removePart.bind(null, id, part.id)} style={{ display: "inline", marginLeft: 8 }}>
                  <button type="submit">삭제</button>
                </form>
              )}
              {latest ? (
                <div>
                  <audio controls preload="none" src={latest.blobUrl} />{" "}
                  <small>{formatMs(latest.durationMs)} · {latest.createdAt.toLocaleString("ko-KR")}</small>
                </div>
              ) : (
                <div><small>가이드 없음</small></div>
              )}
            </li>
          );
        })}
      </ul>

      {isOwner && (
        <>
          <form action={addPart.bind(null, id)} style={{ display: "flex", gap: 8 }}>
            <input name="name" placeholder="파트 이름 (멜로디, 화음1 …)" required />
            <button type="submit">파트 추가</button>
          </form>

          {parts.length > 0 && (
            <>
              <h2>가이드 업로드</h2>
              <p><small>드라이 보컬(반주·리버브 없음)만. 브라우저에서 피치를 뽑은 뒤 올라가요.</small></p>
              <GuideUploader parts={parts.map((p) => ({ id: p.id, name: p.name }))} />
            </>
          )}
        </>
      )}
    </main>
  );
}

function formatMs(ms: number) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

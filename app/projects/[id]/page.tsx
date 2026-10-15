import Link from "next/link";
import { notFound } from "next/navigation";
import TrackUploader from "@/components/TrackUploader";
import { projectForUser } from "@/lib/access";
import type { ReportSummary } from "@/lib/analysis/types";
import { prisma } from "@/lib/db";
import { formatMs } from "@/lib/format";
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
      submissions: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } }, report: { select: { summary: true } } },
      },
    },
  });
  const members = await prisma.projectMember.findMany({ where: { projectId: id }, include: { user: { select: { name: true, email: true } } } });
  const hasGuide = parts.some((p) => p.guideTracks.length > 0);

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
      {hasGuide && (
        <p>
          <Link href={`/projects/${id}/submit`}><button type="button">녹음본 제출</button></Link>
        </p>
      )}

      <h2>파트</h2>
      {parts.length === 0 && <p>파트가 없어요. {isOwner ? "아래에서 추가하세요." : "담당자가 추가하면 여기 보여요."}</p>}
      <ul style={{ paddingLeft: 0, listStyle: "none" }}>
        {parts.map((part) => {
          const latest = part.guideTracks[0];
          return (
            <li key={part.id} style={{ marginBottom: 20 }}>
              <strong>{part.name}</strong>{" "}
              <small>가이드 {part.guideTracks.length}개 · 제출 {part.submissions.length}개</small>
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
              {part.submissions.length > 0 && (
                <ul style={{ marginTop: 6 }}>
                  {part.submissions.map((s) => (
                    <li key={s.id}>
                      <Link href={`/submissions/${s.id}`}>
                        {s.userId === user.id ? "나" : (s.user.name ?? s.user.email)} · 테이크 {s.take}
                      </Link>{" "}
                      <SummaryBadge summary={s.report?.summary as unknown as ReportSummary | undefined} status={s.status} />
                    </li>
                  ))}
                </ul>
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
              <TrackUploader parts={parts.map((p) => ({ id: p.id, name: p.name }))} kind="guide" />
            </>
          )}
        </>
      )}
    </main>
  );
}

function SummaryBadge({ summary, status }: { summary?: ReportSummary; status: string }) {
  if (status === "FAILED") return <small style={{ color: "crimson" }}>분석 실패</small>;
  if (!summary) return <small>분석 중</small>;
  return (
    <small>
      <span style={{ color: "#e5484d" }}>재녹음 {summary.rerecord}</span> ·{" "}
      <span style={{ color: "#f0b429" }}>보정 {summary.fixable}</span> ·{" "}
      <span style={{ color: "#3cb371" }}>OK {summary.ok}</span>
      {summary.unreliable > 0 && <> · <span style={{ color: "#9a9a9a" }}>불가 {summary.unreliable}</span></>}
    </small>
  );
}

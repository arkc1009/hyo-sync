import Link from "next/link";
import { notFound } from "next/navigation";
import QuickUploader from "@/components/QuickUploader";
import TrackUploader from "@/components/TrackUploader";
import { Badge, Button, ButtonLink, Card, ConfirmButton, CopyField, EmptyState, Notice, PageHeader } from "@/components/ui";
import { projectForUser, visibleSubmissionsWhere } from "@/lib/access";
import type { ReportSummary } from "@/lib/analysis/types";
import { audioSrc } from "@/lib/blob";
import { prisma } from "@/lib/db";
import { formatMs } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { addPart, removePart, setVisibility } from "./actions";
import styles from "./page.module.css";

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
        where: visibleSubmissionsWhere(project, user.id),
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { name: true, email: true } },
          report: { select: { summary: true } },
          _count: { select: { comments: true } },
        },
      },
    },
  });
  const members = await prisma.projectMember.findMany({ where: { projectId: id }, include: { user: { select: { name: true, email: true } } } });
  const hasGuide = parts.some((p) => p.guideTracks.length > 0);
  const inst = await prisma.instrumental.findFirst({ where: { projectId: id }, orderBy: { createdAt: "desc" } });

  return (
    <>
      <PageHeader
        back={{ href: "/projects", label: "프로젝트" }}
        title={project.title}
        meta={<>파트 {parts.length} · 멤버 {members.length}{isOwner && <> · <Badge tone="accent">담당자</Badge></>}</>}
        actions={parts.length > 0 && (
          <>
            {hasGuide && <ButtonLink href={`/projects/${id}/submit`} variant="secondary">가이드 비교 제출</ButtonLink>}
            <ButtonLink href={`/projects/${id}/mix`} variant="primary">믹서 · 트랙 올리기</ButtonLink>
          </>
        )}
      />

      <div className={styles.layout}>
        <div className={styles.column}>
          <div className={styles.sectionTitle}>
            <h2>파트</h2>
          </div>

          {parts.length === 0 && (
            <EmptyState title="파트가 없어요">
              {isOwner ? "멜로디, 화음처럼 녹음을 나눌 파트를 아래에서 추가하세요." : "담당자가 파트를 추가하면 여기 보여요."}
            </EmptyState>
          )}

          {parts.map((part) => {
            const latest = part.guideTracks[0];
            return (
              <Card key={part.id} className={styles.part}>
                <div className={styles.partHead}>
                  <span className={styles.partName}>{part.name}</span>
                  <span className={styles.partMeta}>가이드 {part.guideTracks.length} · 제출 {part.submissions.length}</span>
                  {isOwner && (
                    <form action={removePart.bind(null, id, part.id)}>
                      <ConfirmButton message={`"${part.name}" 파트를 삭제할까요? 올라온 가이드와 녹음본도 함께 지워져요.`} variant="ghost" size="sm">
                        삭제
                      </ConfirmButton>
                    </form>
                  )}
                </div>

                {latest ? (
                  <div className={styles.track}>
                    <div className={styles.trackLabel}>
                      <strong>가이드</strong>
                      <span className="mono">{formatMs(latest.durationMs)} · {latest.createdAt.toLocaleDateString("ko-KR")}</span>
                    </div>
                    <audio controls preload="none" src={audioSrc(latest.blobUrl)} />
                  </div>
                ) : (
                  <p className={styles.noTrack}>가이드 없음{isOwner ? " · 아래 가이드 업로드에서 올릴 수 있어요" : ""}</p>
                )}

                {part.submissions.length > 0 && (
                  <ul className={styles.subs}>
                    {part.submissions.map((s) => (
                      <li key={s.id} className={styles.sub}>
                        <Link href={`/submissions/${s.id}`} className={styles.subLink}>
                          {s.userId === user.id ? "나" : (s.user.name ?? s.user.email)}
                        </Link>
                        <span className={styles.take}>테이크 {s.take}</span>
                        <span className={styles.subBadges}>
                          <SummaryBadges summary={s.report?.summary as unknown as ReportSummary | undefined} status={s.status} />
                          {s._count.comments > 0 && <Badge tone="accent">코멘트 {s._count.comments}</Badge>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}

          {isOwner && (
            <Card title="파트 추가">
              <form action={addPart.bind(null, id)} className={styles.addPart}>
                <input name="name" placeholder="파트 이름 (멜로디, 화음1 …)" required aria-label="파트 이름" />
                <Button type="submit">추가</Button>
              </form>
            </Card>
          )}

          {isOwner && parts.length > 0 && (
            <Card title="가이드 업로드" description="드라이 보컬(반주·리버브 없음)만. 브라우저에서 피치를 뽑은 뒤 올라가요.">
              <TrackUploader parts={parts.map((p) => ({ id: p.id, name: p.name }))} kind="guide" />
            </Card>
          )}
        </div>

        <aside className={styles.side}>
          <Card title="INST" description={isOwner ? "멤버 녹음본과 시작점이 맞는 반주 파일" : undefined}>
            <div className={styles.stack}>
              {inst ? (
                <div className={styles.track}>
                  <div className={styles.trackLabel}>
                    <strong>반주</strong>
                    <span className="mono">{formatMs(inst.durationMs)}</span>
                  </div>
                  <audio controls preload="none" src={audioSrc(inst.blobUrl)} />
                </div>
              ) : (
                <p className={styles.noTrack}>INST 없음{isOwner ? ". 올리면 믹서에서 녹음본과 같이 들을 수 있어요." : ""}</p>
              )}
              {isOwner && (
                <>
                  <QuickUploader target={{ kind: "inst", projectId: id }} />
                  {inst && <p className={styles.hint}>새로 올리면 최신 것으로 바뀌어요.</p>}
                </>
              )}
            </div>
          </Card>

          <Card title={`멤버 ${members.length}`}>
            <div className={styles.stack}>
              <div className={styles.members}>
                {members.map((m) => <span key={m.id} className={styles.member}>{m.user.name ?? m.user.email}</span>)}
              </div>
              {isOwner && (
                <>
                  <p className={styles.hint}>초대 링크를 보내면 로그인 후 바로 참여해요.</p>
                  <CopyField path={`/join/${project.inviteCode}`} label="링크 복사" />
                </>
              )}
            </div>
          </Card>

          {isOwner ? (
            <Card title="멤버 열람 범위">
              <form action={setVisibility.bind(null, id)} className={styles.visibility}>
                <select name="visibility" defaultValue={project.visibility} aria-label="멤버 열람 범위">
                  <option value="TEAM">다른 멤버 녹음본·코멘트도 보기</option>
                  <option value="OWN_ONLY">본인 것만 보기</option>
                </select>
                <Button type="submit" size="sm">저장</Button>
              </form>
            </Card>
          ) : (
            project.visibility === "OWN_ONLY" && <Notice>이 프로젝트는 본인 녹음본과 코멘트만 보여요.</Notice>
          )}
        </aside>
      </div>
    </>
  );
}

function SummaryBadges({ summary, status }: { summary?: ReportSummary; status: string }) {
  if (status === "MIX_ONLY") return <Badge>믹스용</Badge>;
  if (status === "FAILED") return <Badge tone="rerecord">분석 실패</Badge>;
  if (!summary) return <Badge>분석 중</Badge>;
  return (
    <>
      {summary.rerecord > 0 && <Badge tone="rerecord" dot>재녹음 {summary.rerecord}</Badge>}
      {summary.fixable > 0 && <Badge tone="fixable" dot>보정 {summary.fixable}</Badge>}
      <Badge tone="ok" dot>OK {summary.ok}</Badge>
      {summary.unreliable > 0 && <Badge tone="unreliable" dot>불가 {summary.unreliable}</Badge>}
    </>
  );
}

import Link from "next/link";
import { Badge } from "@/components/ui";
import { cellKey, cellStatus, type CellStatus, type ProgressSubmission } from "@/lib/progress";
import styles from "./ProgressBoard.module.css";

interface Props {
  projectId: string;
  parts: { id: string; name: string; hasGuide: boolean }[];
  members: { userId: string; name: string }[];
  latest: Map<string, ProgressSubmission>;
  meId: string;
}

/** 파트 × 멤버 현황판. 칸마다 최신 테이크 상태, 누르면 그 리포트로 */
export default function ProgressBoard({ projectId, parts, members, latest, meId }: Props) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>파트</th>
            {members.map((m) => (
              <th key={m.userId} className={m.userId === meId ? styles.me : undefined}>{m.userId === meId ? "나" : m.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id}>
              <th scope="row" className={styles.part}>{p.name}</th>
              {members.map((m) => {
                const sub = latest.get(cellKey(p.id, m.userId));
                const status = cellStatus(sub);
                return (
                  <td key={m.userId}>
                    {sub ? (
                      <Link href={`/submissions/${sub.id}`} className={styles.cell}>
                        <StatusBadge status={status} />
                        <span className={styles.take}>T{sub.take}</span>
                        {sub.commentCount > 0 && <span className={styles.comments}>코멘트 {sub.commentCount}</span>}
                      </Link>
                    ) : m.userId === meId ? (
                      <Link href={`/projects/${projectId}/${p.hasGuide ? "submit" : "mix"}`} className={`${styles.cell} ${styles.upload}`}>
                        + 올리기
                      </Link>
                    ) : (
                      <span className={styles.empty}>미제출</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ status }: { status: CellStatus }) {
  switch (status.kind) {
    case "none": return <Badge>미제출</Badge>;
    case "analyzing": return <Badge>분석 중</Badge>;
    case "failed": return <Badge tone="rerecord">분석 실패</Badge>;
    case "mix": return <Badge tone="accent">믹스용</Badge>;
    case "rerecord": return <Badge tone="rerecord" dot>재녹음 {status.count}</Badge>;
    case "fixable": return <Badge tone="fixable" dot>보정 {status.count}</Badge>;
    case "ok": return <Badge tone="ok" dot>OK</Badge>;
  }
}

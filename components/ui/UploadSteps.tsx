import styles from "./UploadSteps.module.css";

export interface UploadStep {
  label: string;
  /** 오른쪽 작은 글자 (용량 등) */
  detail?: string;
  /** 0~1. 있으면 진행 막대 */
  progress?: number;
}

/** 업로드 단계 표시. current 앞은 완료, current 는 진행 중, 뒤는 대기 */
export function UploadSteps({ steps, current }: { steps: UploadStep[]; current: number }) {
  return (
    <ol className={styles.steps} aria-live="polite">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={s.label} className={styles.step} data-state={state}>
            <span className={styles.mark} aria-hidden>{state === "done" ? "✓" : ""}</span>
            <span>{s.label}</span>
            <span className={styles.detail}>{state === "active" ? s.detail : ""}</span>
            {state === "active" && s.progress != null && (
              <span className={styles.bar}><span style={{ width: `${Math.round(s.progress * 100)}%` }} /></span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

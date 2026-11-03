import type { ReactNode } from "react";
import styles from "./Badge.module.css";

export type BadgeTone = "neutral" | "accent" | "ok" | "fixable" | "rerecord" | "unreliable";

/** 상태·판정 배지. 색만으로 구분하지 않도록 항상 글자를 같이 쓴다 */
export function Badge({ tone = "neutral", dot, children }: { tone?: BadgeTone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={`${styles.badge} ${styles[tone]}`}>
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  );
}

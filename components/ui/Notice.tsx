import type { ReactNode } from "react";
import styles from "./Notice.module.css";

/** 화면 안 안내·경고·에러 상자 */
export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error"; children: ReactNode }) {
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={tone === "error" ? "alert" : undefined}>
      <div>{children}</div>
    </div>
  );
}

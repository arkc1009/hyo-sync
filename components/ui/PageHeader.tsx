import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./PageHeader.module.css";

interface Props {
  title: ReactNode;
  /** 제목 아래 한 줄 (멤버 수, 길이 등) */
  meta?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}

export function PageHeader({ title, meta, back, actions }: Props) {
  return (
    <header className={styles.header}>
      <div>
        {back && (
          <Link href={back.href} className={styles.back}>
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {meta && <div className={styles.meta}>{meta}</div>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}

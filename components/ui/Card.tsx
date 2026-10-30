import type { ComponentProps, ReactNode } from "react";
import styles from "./Card.module.css";

interface Props extends Omit<ComponentProps<"section">, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** 안쪽 여백 없이 (목록·표를 가장자리까지) */
  flush?: boolean;
}

export function Card({ title, description, actions, flush, className, children, ...rest }: Props) {
  return (
    <section className={[styles.card, flush && styles.flush, className].filter(Boolean).join(" ")} {...rest}>
      {(title || actions) && (
        <header className={styles.header}>
          <div>
            {title && <h2 className={styles.title}>{title}</h2>}
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

import Link from "next/link";
import type { ComponentProps } from "react";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 정사각 아이콘 버튼. aria-label 을 같이 줄 것 */
  icon?: boolean;
}

export function buttonClass({ variant = "secondary", size = "md", icon = false }: StyleProps = {}, extra?: string) {
  return [styles.button, styles[variant], size !== "md" && styles[size], icon && styles.icon, extra].filter(Boolean).join(" ");
}

export function Button({ variant, size, icon, className, type = "button", ...rest }: StyleProps & ComponentProps<"button">) {
  return <button type={type} className={buttonClass({ variant, size, icon }, className)} {...rest} />;
}

/** 버튼 모양의 링크. <Link><button> 중첩 대신 쓴다 */
export function ButtonLink({ variant, size, icon, className, ...rest }: StyleProps & ComponentProps<typeof Link>) {
  return <Link className={buttonClass({ variant, size, icon }, className)} {...rest} />;
}

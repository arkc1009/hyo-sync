import Link from "next/link";
import type { ReactNode } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import styles from "./AppShell.module.css";

/** 로그인 후 화면 공통 틀: 상단 바(로고·이동·테마·계정) + 본문 폭 */
export default async function AppShell({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const display = user.name ?? user.email ?? "";

  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          <Link href="/projects" className={styles.logo}>
            <span className={styles.mark} aria-hidden><span /><span /><span /></span>
            hyo sync
          </Link>
          <nav className={styles.nav}>
            <Link href="/projects" className={styles.navLink}>프로젝트</Link>
          </nav>
          <div className={styles.spacer} />
          <ThemeToggle />
          <div className={styles.user}>
            {user.image ? (
              // Google 아바타. next/image 원격 패턴 설정 없이 그대로
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className={styles.avatar} referrerPolicy="no-referrer" />
            ) : (
              <span className={styles.avatar} aria-hidden>{display.slice(0, 1)}</span>
            )}
            <span className={styles.name} title={user.email ?? undefined}>{display}</span>
            <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
              <Button type="submit" variant="ghost" size="sm">로그아웃</Button>
            </form>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}

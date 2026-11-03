"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui";

type Theme = "dark" | "light";

/** 다크(기본) ↔ 라이트. <html data-theme> 와 localStorage("theme") 에 저장. 첫 적용은 app/layout.tsx 의 인라인 스크립트 */
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark");

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  const label = theme === "light" ? "다크 모드로" : "라이트 모드로";
  return (
    <Button variant="ghost" icon onClick={toggle} aria-label={label} title={label}>
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </Button>
  );
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

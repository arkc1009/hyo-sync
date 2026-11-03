import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "hyo sync", template: "%s · hyo sync" },
  description: "함께 부르는 노래 프로젝트의 녹음·피드백을 한곳에서",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
};

// 첫 페인트 전에 저장된 테마를 적용해 깜빡임을 막는다 (기본 다크)
const THEME_SCRIPT = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "hyo sync",
  description: "단체 보컬 녹음 음정·박자 체크",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

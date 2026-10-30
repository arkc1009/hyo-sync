"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "./Button";
import styles from "./CopyField.module.css";

/** 경로를 현재 origin 기준 전체 URL 로 보여 주고 복사 버튼을 단다 (초대 링크) */
export function CopyField({ path, label = "복사" }: { path: string; label?: string }) {
  // 서버 렌더에선 경로만, 브라우저에선 현재 도메인을 붙인다 (프리뷰·프로덕션 모두 맞게)
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const url = origin + path;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      window.prompt("복사해서 보내세요", url);
    }
  }

  return (
    <div className={styles.field}>
      <span className={styles.value} title={url}>{url}</span>
      <Button size="sm" variant={copied ? "secondary" : "primary"} onClick={copy} aria-live="polite">
        {copied ? "복사됨" : label}
      </Button>
    </div>
  );
}

function noopSubscribe() {
  return () => {};
}

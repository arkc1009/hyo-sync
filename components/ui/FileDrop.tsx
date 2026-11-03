"use client";

import { useState } from "react";
import styles from "./FileDrop.module.css";

interface Props {
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  /** 비어 있을 때 아래 줄 안내 */
  hint?: string;
}

/** 오디오 파일 끌어다 놓기 + 눌러서 선택 */
export function FileDrop({ file, onFile, disabled, hint = "wav · mp3 · m4a" }: Props) {
  const [over, setOver] = useState(false);
  return (
    <label
      className={styles.drop}
      data-over={over || undefined}
      data-disabled={disabled || undefined}
      data-has-file={file ? true : undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
    >
      <input type="file" accept="audio/*" disabled={disabled} onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      <span className={styles.icon} aria-hidden>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 12v0M8 8v8M12 4v16M16 7v10M20 11v2" />
        </svg>
      </span>
      <span className={styles.text}>
        {file ? (
          <>
            <span className={styles.title} title={file.name}>{file.name}</span>
            <span className={styles.hint}>{(file.size / 1024 / 1024).toFixed(1)}MB · 다른 파일로 바꾸려면 다시 누르세요</span>
          </>
        ) : (
          <>
            <span className={styles.title}>오디오 파일을 끌어다 놓거나 눌러서 선택</span>
            <span className={styles.hint}>{hint}</span>
          </>
        )}
      </span>
    </label>
  );
}

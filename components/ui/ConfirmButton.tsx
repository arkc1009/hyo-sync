"use client";

import type { ComponentProps } from "react";
import { Button } from "./Button";

/** 폼 제출 전에 확인을 받는 버튼 (삭제 등 되돌릴 수 없는 동작) */
export function ConfirmButton({ message, onClick, ...rest }: { message: string } & ComponentProps<typeof Button>) {
  return (
    <Button
      type="submit"
      {...rest}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
        else onClick?.(e);
      }}
    />
  );
}

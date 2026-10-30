"use client";

import { useEffect, useRef, type ReactNode } from "react";

// 화면에 들어오면 data-shown 을 붙인다. 실제 등장 모션은 landing.module.css 의 [data-reveal] 규칙이 맡는다
export default function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.dataset.shown = "";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            el.dataset.shown = "";
            io.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} data-reveal="" style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

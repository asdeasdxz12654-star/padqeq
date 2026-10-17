"use client";

import { useEffect, useRef } from "react";

/**
 * ⋯ 더보기: 신고 · 컬렉션 · 작가 메뉴 · 운영 메뉴를 한곳에 (보는 사람 화면에는 좋아요 · 저장 · 공유만 크게).
 * 바깥을 누르거나 Esc면 닫힌다. 안의 버튼들은 각자 창(신고 등)을 연다.
 */
export function MoreMenu({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const d = box.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      // 안에서 연 창(신고 등)을 누른 것은 닫지 않는다
      if (e.target instanceof Node && (d.contains(e.target) || (e.target as Element).closest?.("dialog"))) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={box} className="relative">
      <summary
        aria-label="더보기"
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-full border border-line hover:border-quiet [&::-webkit-details-marker]:hidden"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </summary>
      <div className="absolute right-0 z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-line bg-bg p-4 shadow-xl">
        {children}
      </div>
    </details>
  );
}

/** 더보기 안의 묶음 제목 */
export function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-xs font-bold text-quiet">{title}</p>
      {children}
    </div>
  );
}

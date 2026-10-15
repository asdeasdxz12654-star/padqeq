"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * 게시물을 보던 화면 위에 겹쳐 연다 (S-07 ①). 닫으면 뒤로 가기 → 피드가 보던 자리 그대로 남아 있다.
 * 휴대폰에서는 화면을 꽉 채운 한 장, 넓은 화면에서는 가장자리에 피드가 비친다.
 * 겹쳐 연 동안 단축키는 이 안의 것만 듣는다 (data-overlay, lib/keyboard.ts).
 */
export function PostOverlay({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 뒤 화면이 같이 스크롤되지 않게, 닫으면 원래대로 (보던 위치는 브라우저가 지킨다)
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // 사진 확대를 푸는 Esc는 뷰어가 먼저 쓴다
      if (e.key === "Escape" && !e.defaultPrevented && document.querySelector("dialog[open]") === null) router.back();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [router]);

  return (
    <div data-overlay className="fixed inset-0 z-50 flex justify-center bg-black/70 md:p-6" onClick={(e) => e.target === e.currentTarget && router.back()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="게시물"
        tabIndex={-1}
        className="relative w-full overflow-y-auto overscroll-contain bg-bg pt-[env(safe-area-inset-top)] outline-none md:max-w-[1440px] md:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex justify-end bg-gradient-to-b from-bg to-transparent px-2 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="닫기 (Esc)"
            className="flex size-11 items-center justify-center rounded-full bg-surface/90 text-xl text-text shadow hover:bg-surface"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="-mt-11">{children}</div>
      </div>
    </div>
  );
}

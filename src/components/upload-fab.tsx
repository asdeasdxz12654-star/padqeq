"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { WriteMenuList } from "./write-menu";

// 글쓰기 떠 있는 버튼 (휴대폰 · 웹앱): 아래 탭 바로 위 오른쪽. 누르면 아래에서 작성 목록이 올라온다. PC는 상단 [글쓰기 ▾].
// 글을 쓰는 중이거나 로그인 · 가입 · 설정처럼 다른 일을 하는 화면, 관리자 화면, 게시물 화면(댓글 입력칸과 겹친다)에서는 숨긴다.
const HIDDEN = ["/upload", "/login", "/welcome", "/settings", "/admin", "/community/write", "/events/propose", "/me/messages", "/p"];

export function UploadFab() {
  const pathname = usePathname();
  const sheet = useRef<HTMLDialogElement>(null);
  // 아래로 스크롤하는 동안은 숨기고, 위로 올리거나 맨 위면 다시 (맨 아래의 '더 보기' · 입력칸을 가리지 않게)
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 8) return;
      setHidden(y > last && y > 80);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  const close = () => sheet.current?.close();
  return (
    <>
      <button
        type="button"
        aria-label="글쓰기"
        aria-haspopup="dialog"
        tabIndex={hidden ? -1 : undefined}
        aria-hidden={hidden || undefined}
        onClick={() => sheet.current?.showModal()}
        className={`fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg shadow-black/20 transition-transform duration-200 active:scale-95 md:hidden ${
          hidden ? "pointer-events-none translate-y-24" : ""
        }`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <dialog
        ref={sheet}
        aria-label="글쓰기"
        // 바깥(어두운 곳)을 누르면 닫힌다
        onClick={(e) => e.target === e.currentTarget && close()}
        className="m-0 mt-auto w-full max-w-none rounded-t-3xl bg-bg p-0 text-text backdrop:bg-black/45 md:hidden"
      >
        <div className="flex flex-col gap-3 px-4 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          <span aria-hidden="true" className="h-1 w-10 self-center rounded-full bg-line" />
          <div className="flex items-center">
            <strong className="text-lg">글쓰기</strong>
            <button type="button" onClick={close} aria-label="닫기" className="ml-auto flex size-10 items-center justify-center rounded-full text-quiet hover:bg-surface">
              ×
            </button>
          </div>
          <WriteMenuList onPick={close} />
        </div>
      </dialog>
    </>
  );
}

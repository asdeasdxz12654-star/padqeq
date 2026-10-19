"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 올리기 플로팅 버튼 (휴대폰 · 웹앱): 아래 탭 바로 위 오른쪽에 떠 있다. PC는 상단의 '올리기' 버튼.
// 올리는 중이거나 로그인 · 가입 · 설정처럼 다른 일을 하는 화면, 관리자 화면에서는 숨긴다.
const HIDDEN = ["/upload", "/login", "/welcome", "/settings", "/admin", "/community/write", "/me/messages"];

export function UploadFab() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;
  return (
    <Link
      prefetch={false}
      href="/upload"
      aria-label="사진 올리기"
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg shadow-black/20 active:scale-95 md:hidden"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
      </svg>
    </Link>
  );
}

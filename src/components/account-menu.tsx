"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { signOut } from "@/app/me/actions";
import { profileHref } from "@/lib/profiles/profile-href";
import { Avatar } from "./avatar";

// 마이 A안: 마이페이지를 맨 위에, 저장 · 컬렉션은 한 칸
const ITEMS = [
  { href: "/me", label: "마이페이지" },
  { href: "/me/posts", label: "내 글 관리" },
  { href: "/me/saved", label: "저장 · 컬렉션" },
  { href: "/me/messages", label: "메시지" },
  { href: "/settings", label: "설정" },
] as const;

/**
 * PC 헤더의 내 계정 메뉴 (휴대폰은 아래 탭 '마이'). 프로필 사진 · 핸들을 누르면 열린다.
 * 내 프로필 · 마이페이지 · 내 글 · 저장 · 컬렉션 · 메시지 · 설정 · 로그아웃을 한 번에.
 * 바깥을 누르거나 Esc, 항목을 고르면 닫힌다.
 */
export function AccountMenu({ handle, avatarKey }: { handle: string; avatarKey: string | null }) {
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const d = box.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      if (e.target instanceof Node && d.contains(e.target)) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  const done = () => {
    if (box.current) box.current.open = false;
  };
  const item = "flex min-h-10 items-center justify-between rounded-lg px-3 text-sm hover:bg-surface";

  return (
    <details ref={box} className="relative hidden md:block">
      <summary
        aria-label={`@${handle} 계정 메뉴`}
        className="flex min-h-11 max-w-44 cursor-pointer list-none items-center gap-2 text-quiet hover:text-text [&::-webkit-details-marker]:hidden"
      >
        <Avatar avatarKey={avatarKey} size={28} />
        <span className="truncate">@{handle}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </summary>
      <div className="absolute right-0 z-40 mt-2 flex w-60 flex-col rounded-2xl border border-line bg-bg p-2 shadow-xl">
        <Link href={profileHref(handle)} onClick={done} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-surface">
          <Avatar avatarKey={avatarKey} size={36} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold">@{handle}</span>
            <span className="block text-xs text-quiet">내 프로필 보기</span>
          </span>
        </Link>
        <span className="my-1 h-px bg-line" />
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} onClick={done} className={item}>
            {i.label}
          </Link>
        ))}
        <span className="my-1 h-px bg-line" />
        <form action={signOut}>
          <button type="submit" className={`${item} w-full text-quiet`}>
            로그아웃
          </button>
        </form>
      </div>
    </details>
  );
}

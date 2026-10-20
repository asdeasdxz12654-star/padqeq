"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SETTINGS_TABS = [
  { href: "/settings", label: "프로필 수정" },
  { href: "/settings/account", label: "계정" },
  { href: "/settings/display", label: "화면 · 보기" },
  { href: "/settings/alerts", label: "알림" },
  { href: "/settings/privacy", label: "공개 범위 · 메시지" },
  { href: "/settings/data", label: "내 데이터 · 탈퇴" },
] as const;

/** 설정 탭: 탭마다 화면이 따로 열린다 (PC는 왼쪽 세로, 휴대폰은 위쪽 가로로 넘긴다) */
export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="설정 메뉴"
      className="sticky top-14 z-10 -mx-4 mb-6 flex gap-2 overflow-x-auto bg-bg px-4 py-2 md:top-20 md:mx-0 md:mb-0 md:flex-col md:self-start md:overflow-visible md:p-0"
    >
      {SETTINGS_TABS.map(({ href, label }) => {
        const current = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className="inline-flex min-h-10 shrink-0 items-center rounded-full border border-line px-3.5 text-sm hover:border-quiet aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg md:rounded-xl md:border-0 md:px-3 md:hover:bg-surface md:aria-[current=page]:bg-surface md:aria-[current=page]:font-semibold md:aria-[current=page]:text-text"
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { href: string; label: string; badge?: number; adminOnly?: boolean };
type Group = { title: string; items: Item[] };

/** 운영 메뉴 (관리자 디자인 v2): 5묶음. 운영 도우미에게는 쓸 수 있는 메뉴만 보인다. */
export function AdminNav({ isAdmin, inbox }: { isAdmin: boolean; inbox: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const groups: Group[] = [
    { title: "오늘", items: [{ href: "/admin", label: "대시보드", adminOnly: true }] },
    {
      title: "처리",
      items: [
        { href: "/admin/inbox", label: "처리함", badge: inbox },
        { href: "/admin/reports", label: "신고 · 소명" },
        { href: "/admin/support", label: "1:1 문의", adminOnly: true },
      ],
    },
    {
      title: "콘텐츠",
      items: [
        { href: "/admin/posts", label: "게시물", adminOnly: true },
        { href: "/admin/tags", label: "태그", adminOnly: true },
        { href: "/admin/events", label: "행사", adminOnly: true },
        { href: "/admin/support?tab=notices", label: "공지", adminOnly: true },
      ],
    },
    { title: "사람", items: [{ href: "/admin/members", label: "회원" }] },
    {
      title: "시스템",
      items: [
        { href: "/admin/support?tab=system", label: "운영 단계 · 스위치 · 한도", adminOnly: true },
        { href: "/admin/audit", label: "감사 로그", adminOnly: true },
      ],
    },
  ]
    .map((g) => ({ ...g, items: g.items.filter((i) => isAdmin || !i.adminOnly) }))
    .filter((g) => g.items.length > 0);

  const tab = params.get("tab");
  const active = (href: string) => {
    const [path, query] = href.split("?");
    if (path === "/admin") return pathname === "/admin";
    if (path === "/admin/support") {
      const want = query ? new URLSearchParams(query).get("tab") : null;
      const now = tab === "notices" || tab === "system" ? tab : null;
      return pathname === path && want === now;
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  const link = (i: Item, compact: boolean) => (
    <Link
      key={i.href}
      href={i.href}
      prefetch={false}
      aria-current={active(i.href) ? "page" : undefined}
      className={
        compact
          ? "inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          : "flex min-h-10 items-center justify-between gap-2 rounded-xl px-3 text-sm hover:bg-surface aria-[current=page]:bg-surface aria-[current=page]:font-bold"
      }
    >
      {i.label}
      {i.badge ? (
        <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent tabular-nums">{i.badge > 99 ? "99+" : i.badge}</span>
      ) : null}
    </Link>
  );

  return (
    <>
      {/* 휴대폰: 한 줄 칩 (가로로 밀기) */}
      <nav aria-label="운영 메뉴" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {groups.flatMap((g) => g.items).map((i) => link(i, true))}
      </nav>
      {/* PC: 왼쪽 고정 메뉴 */}
      <nav aria-label="운영 메뉴" className="sticky top-20 hidden self-start lg:flex lg:flex-col lg:gap-5">
        {groups.map((g) => (
          <div key={g.title} className="flex flex-col gap-0.5">
            <p className="px-3 pb-1 text-xs font-bold text-quiet">{g.title}</p>
            {g.items.map((i) => link(i, false))}
          </div>
        ))}
      </nav>
    </>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { href: string; label: string; badge?: number; adminOnly?: boolean };
type Group = { title: string; items: Item[] };

/**
 * 운영 메뉴 (관리 시안 43): 4묶음 — 오늘 · 콘텐츠 · 사람 · 설정. 운영 도우미에게는 쓸 수 있는 메뉴만 보인다.
 * PC는 왼쪽 세로 메뉴, 휴대폰은 아래 4칸(묶음) + 위쪽에 지금 묶음의 메뉴.
 * 신고 · 소명 · 문의 · 요청은 모두 처리함에서 처리하고, '처리한 기록'은 지난 처리를 본다.
 */
export function AdminNav({ isAdmin, inbox }: { isAdmin: boolean; inbox: number }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const groups: Group[] = [
    {
      title: "오늘",
      items: [
        { href: "/admin/inbox", label: "처리함", badge: inbox },
        { href: "/admin", label: "대시보드", adminOnly: true },
      ],
    },
    {
      title: "콘텐츠",
      items: [
        { href: "/admin/posts", label: "게시물", adminOnly: true },
        { href: "/admin/tags", label: "태그", adminOnly: true },
        { href: "/admin/events", label: "행사", adminOnly: true },
      ],
    },
    {
      title: "사람",
      items: [
        { href: "/admin/members", label: "회원" },
        { href: "/admin/reports?tab=done", label: "처리한 기록" },
        { href: "/admin/support?tab=answered", label: "답변한 문의", adminOnly: true },
      ],
    },
    {
      title: "설정",
      items: [
        { href: "/admin/support?tab=notices", label: "공지", adminOnly: true },
        { href: "/admin/support?tab=system", label: "운영 단계 · 한도 · 금칙어", adminOnly: true },
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
    // 같은 화면을 탭으로 나눈 메뉴 (고객센터 · 처리한 기록)
    if (path === "/admin/support" || path === "/admin/reports") {
      const want = query ? new URLSearchParams(query).get("tab") : null;
      return pathname === path && want === tab;
    }
    return pathname === path || pathname.startsWith(`${path}/`);
  };
  // 지금 화면이 속한 묶음 (예전 주소 /admin/reports · /admin/support도 묶음에 넣는다)
  const current =
    groups.find((g) => g.items.some((i) => active(i.href))) ??
    groups.find((g) => g.items.some((i) => pathname.startsWith(i.href.split("?")[0]!) && i.href !== "/admin")) ??
    groups[0]!;

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
      {i.badge ? <span className="rounded-full bg-accent px-1.5 text-xs font-bold text-on-accent tabular-nums">{i.badge > 99 ? "99+" : i.badge}</span> : null}
    </Link>
  );

  return (
    <>
      {/* 휴대폰: 위쪽은 지금 묶음의 메뉴, 아래는 묶음 4칸 */}
      {current.items.length > 1 && (
        <nav aria-label={`${current.title} 메뉴`} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
          {current.items.map((i) => link(i, true))}
        </nav>
      )}
      <nav
        aria-label="운영 메뉴"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
          {groups.map((g) => {
            const first = g.items[0]!;
            const badge = g.items.reduce((n, i) => n + (i.badge ?? 0), 0);
            return (
              <li key={g.title}>
                <Link
                  href={first.href}
                  prefetch={false}
                  aria-current={g === current ? "page" : undefined}
                  className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-quiet aria-[current=page]:font-bold aria-[current=page]:text-text"
                >
                  <span className="flex items-center gap-1">
                    {g.title === "오늘" ? "처리함" : g.title}
                    {badge > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-on-accent tabular-nums">{badge > 99 ? "99+" : badge}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
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

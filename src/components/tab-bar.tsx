"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./nav-items";

// 탭 아이콘 (선 아이콘, 지금 탭은 채움)
const ICONS: Record<(typeof NAV_ITEMS)[number]["href"], { line: string; fill?: string }> = {
  "/": { line: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" },
  "/explore": { line: "M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zm5.2 12.2L20 20" },
  "/upload": { line: "M12 7v10M7 12h10", fill: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z" },
  "/community": {
    line: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c1.7.7 2.8 2.4 3 5.2",
  },
  "/me": { line: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9c.6-4 3.4-6 7-6s6.4 2 7 6" },
};

/** 모바일 하단 탭 (767px 이하). 같은 탭을 다시 누르면 맨 위로. */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="하단 탭"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = isActive(pathname, href);
          const icon = ICONS[href];
          return (
            <li key={href}>
              <Link prefetch={false}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (active) window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "font-bold text-text" : "text-quiet"
                }`}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.6} strokeLinecap="round" strokeLinejoin="round">
                  {/* 업로드는 늘 강조 (채운 원 + 흰 더하기) */}
                  {icon.fill && <path d={icon.fill} fill="currentColor" stroke="none" />}
                  <path d={icon.line} className={icon.fill ? "stroke-bg" : undefined} fill={active && !icon.fill && href !== "/explore" ? "currentColor" : "none"} fillOpacity={0.15} />
                </svg>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

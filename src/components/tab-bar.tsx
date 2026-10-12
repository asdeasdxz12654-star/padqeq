"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./nav-items";

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
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (active) window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${
                  active ? "font-bold text-text" : "text-quiet"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`block size-[22px] border-[1.5px] border-current ${
                    href === "/upload" ? "rounded-full bg-current" : "rounded-md"
                  }`}
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

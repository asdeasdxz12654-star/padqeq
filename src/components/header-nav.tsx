"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HEADER_NAV } from "./nav-items";

/** PC 상단 메뉴. 지금 있는 곳은 옅은 면으로 표시한다. */
export function HeaderNav() {
  const pathname = usePathname();
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="주 메뉴" className="hidden md:block">
      <ul className="flex gap-1 text-sm">
        {HEADER_NAV.map(({ href, label }) => (
          <li key={href}>
            <Link
              prefetch={false}
              href={href}
              aria-current={current(href) ? "page" : undefined}
              className="flex min-h-10 items-center rounded-lg px-3 text-quiet hover:text-text aria-[current=page]:bg-surface aria-[current=page]:font-bold aria-[current=page]:text-text"
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

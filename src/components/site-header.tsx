import Link from "next/link";
import { NAV_ITEMS } from "./nav-items";

/** 상단 바. 데스크톱(768px~)에서는 GNB + 업로드 버튼, 모바일에서는 로고만. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-8 px-4 md:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          해담
        </Link>
        <nav aria-label="주 메뉴" className="hidden md:block">
          <ul className="flex gap-6 text-sm text-quiet">
            {NAV_ITEMS.filter(({ href }) => href !== "/upload").map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="hover:text-text">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href="/upload"
          className="ml-auto hidden rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent md:inline-block"
        >
          업로드
        </Link>
      </div>
    </header>
  );
}

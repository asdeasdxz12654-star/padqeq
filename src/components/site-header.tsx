import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { NAV_ITEMS } from "./nav-items";

/** 상단 바. 데스크톱(768px~)에서는 GNB + 업로드 버튼 + 계정, 모바일에서는 로고와 가입 안내만. */
export async function SiteHeader() {
  const viewer = await getViewer();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-8 px-4 md:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          해담
        </Link>
        <nav aria-label="주 메뉴" className="hidden md:block">
          <ul className="flex gap-6 text-sm text-quiet">
            {NAV_ITEMS.filter(({ href }) => href !== "/upload" && href !== "/me").map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="hover:text-text">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {viewer && !viewer.profile ? (
            // 로그인은 했지만 핸들을 정하지 않은 상태 (가입 도중 이탈)
            <Link href="/welcome" className="rounded-full border border-accent px-3 py-1.5 font-semibold text-accent">
              가입 마무리
            </Link>
          ) : (
            <>
              <Link
                href="/upload"
                className="hidden rounded-full bg-accent px-4 py-2 font-semibold text-on-accent md:inline-block"
              >
                업로드
              </Link>
              {viewer?.profile ? (
                <Link href="/me" className="hidden max-w-40 truncate text-quiet hover:text-text md:block">
                  @{viewer.profile.handle}
                </Link>
              ) : (
                <Link href="/login" className="hidden text-quiet hover:text-text md:block">
                  로그인
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";
import { getAdminPending } from "@/lib/admin/pending";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { getUnreadCount } from "@/lib/notifications/unread";
import { profileHref } from "@/lib/profiles/profile-href";
import { NAV_ITEMS } from "./nav-items";

/** 상단 바. 데스크톱(768px~)에서는 GNB + 업로드 버튼 + 계정, 모바일에서는 로고와 가입 안내만. */
export async function SiteHeader() {
  const viewer = await getViewer();
  const isStaff = isStaffRole(viewer?.profile?.role);
  const mfaRequired = viewer?.mfaRequired ?? false;
  const [unread, pending] = await Promise.all([getUnreadCount(viewer?.profile ? viewer.id : null), isStaff ? getAdminPending() : null]);

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
              {mfaRequired && (
                <Link href="/admin" className="flex min-h-11 items-center text-quiet hover:text-text">
                  운영 (인증)
                </Link>
              )}
              {pending && (
                <Link
                  href={viewer?.profile?.role === "admin" ? "/admin" : "/admin/reports"}
                  aria-label={pending.total ? `운영, 처리할 일 ${pending.total}건` : "운영"}
                  className="flex min-h-11 items-center gap-1.5 text-quiet hover:text-text"
                >
                  운영
                  {pending.total > 0 && (
                    <span className="min-w-[18px] rounded-full bg-red-500/80 px-1 text-center text-[11px] leading-[18px] font-bold text-white">
                      {pending.total > 99 ? "99+" : pending.total}
                    </span>
                  )}
                </Link>
              )}
              {viewer?.profile && <NotificationBell unread={unread} />}
              {viewer?.profile ? (
                <Link href={profileHref(viewer.profile.handle)} className="hidden max-w-40 truncate text-quiet hover:text-text md:block">
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

/** 알림 (모바일 · 데스크톱 모두). 안 읽은 수는 99까지. */
function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `알림, 안 읽은 알림 ${unread}개` : "알림"}
      className="relative -mr-2 flex size-11 items-center justify-center text-quiet hover:text-text md:mr-0"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0 1 12 0c0 4.5 1.5 6.5 2.5 7.5h-17C4.5 15.5 6 13.5 6 9Z" />
        <path d="M10 19.5a2 2 0 0 0 4 0" />
      </svg>
      {unread > 0 && (
        <span className="absolute top-1.5 right-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] leading-[18px] font-bold text-on-accent">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

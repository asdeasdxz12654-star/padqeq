import Link from "next/link";
import { getAdminPending } from "@/lib/admin/pending";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { AccountMenu } from "./account-menu";
import { getUnreadCount } from "@/lib/notifications/unread";
import { createClient } from "@/lib/supabase/server";
import { HeaderNav } from "./header-nav";
import { HeaderAutoHide } from "./header-auto-hide";
import { HeaderSearch } from "./search-box";
import { HaedamLogo } from "./haedam-logo";

/** 상단 바. 데스크톱(768px~)에서는 GNB + 업로드 버튼 + 계정, 모바일에서는 로고와 가입 안내만. */
export async function SiteHeader() {
  const viewer = await getViewer();
  const isStaff = isStaffRole(viewer?.profile?.role);
  const mfaRequired = viewer?.mfaRequired ?? false;
  const member = Boolean(viewer?.profile);
  const supabase = member ? await createClient() : null;
  const [unread, pending, unreadThreads] = await Promise.all([
    getUnreadCount(viewer?.profile ? viewer.id : null),
    isStaff ? getAdminPending() : null,
    // 메시지는 마이에서 헤더로 (알림 종 옆): 안 읽은 대화 수
    supabase ? supabase.rpc("unread_thread_count").then((r) => r.data ?? 0) : Promise.resolve(0),
  ]);

  return (
    <header data-site-header className="sticky top-0 z-30 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <HeaderAutoHide />
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-6 px-4 md:px-6">
        <Link prefetch={false} href="/" aria-label="해담 홈" className="-ml-2 flex min-h-11 items-center px-2">
          <HaedamLogo />
        </Link>
        <HeaderNav />
        <div className="ml-auto flex items-center gap-1 text-sm md:gap-4">
          <HeaderSearch />
          {viewer && !viewer.profile ? (
            // 로그인은 했지만 핸들을 정하지 않은 상태 (가입 도중 이탈)
            <Link prefetch={false} href="/welcome" className="rounded-full border border-accent px-3 py-1.5 font-semibold text-accent">
              가입 마무리
            </Link>
          ) : (
            <>
              <Link prefetch={false}
                href="/upload"
                className="hidden min-h-10 items-center rounded-full bg-accent px-4 font-bold text-on-accent md:inline-flex"
              >
                올리기
              </Link>
              {mfaRequired && (
                <Link prefetch={false} href="/admin" className="flex min-h-11 items-center text-quiet hover:text-text">
                  운영 (인증)
                </Link>
              )}
              {pending && (
                <Link prefetch={false}
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
              {/* 메시지 · 알림은 한 묶음으로 붙여 둔다 (헤더의 다른 요소 사이 간격을 받지 않게) */}
              {viewer?.profile && (
                <div className="-mr-2 flex items-center md:mr-0">
                  <MessagesLink unread={unreadThreads} />
                  <NotificationBell unread={unread} />
                </div>
              )}
              {viewer?.profile ? (
                // 내 계정 메뉴: 내 프로필 · 내 글 · 저장 · 컬렉션 · 메시지 · 설정 · 로그아웃 (휴대폰은 아래 탭 '마이')
                <AccountMenu handle={viewer.profile.handle} avatarKey={viewer.profile.avatar_key} />
              ) : (
                <Link prefetch={false} href="/login" className="flex min-h-11 items-center px-1 text-quiet hover:text-text">
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

/** 메시지 (모바일 · 데스크톱 모두, 알림 종 옆). 안 읽은 대화 수는 99까지. */
function MessagesLink({ unread }: { unread: number }) {
  return (
    <Link prefetch={false}
      href="/me/messages"
      aria-label={unread > 0 ? `메시지, 안 읽은 대화 ${unread}개` : "메시지"}
      className="relative flex size-11 items-center justify-center text-quiet hover:text-text"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h16v11H8l-4 4z" />
      </svg>
      {unread > 0 && (
        <span className="absolute top-1.5 right-1 min-w-[18px] rounded-full bg-accent px-1 text-center text-[11px] leading-[18px] font-bold text-on-accent">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}

/** 알림 (모바일 · 데스크톱 모두). 안 읽은 수는 99까지. */
function NotificationBell({ unread }: { unread: number }) {
  return (
    <Link prefetch={false}
      href="/notifications"
      aria-label={unread > 0 ? `알림, 안 읽은 알림 ${unread}개` : "알림"}
      className="relative flex size-11 items-center justify-center text-quiet hover:text-text"
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

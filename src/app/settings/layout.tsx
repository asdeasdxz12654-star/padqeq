import Link from "next/link";
import { signOut } from "@/app/me/actions";
import { SettingsTabs } from "./settings-tabs";

// S-14 설정: 탭마다 화면을 나눈다 (프로필 수정 · 계정 · 화면 · 보기 · 알림 · 공개 범위 · 메시지 · 내 데이터 · 탈퇴).
// 고객센터 · 로그아웃 · 정책 링크는 모든 탭의 맨 아래에. 로그인 확인은 탭 화면마다 (돌아올 주소를 그 탭으로)
export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 md:grid md:grid-cols-[180px_minmax(0,1fr)] md:gap-10 md:px-6">
      <SettingsTabs />
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex items-center gap-3">
          <Link href="/me" className="text-sm text-quiet hover:text-text">
            ‹ 마이페이지
          </Link>
          <p className="text-2xl font-bold">설정</p>
        </header>

        {children}

        <section aria-label="고객센터 · 로그아웃" className="flex flex-col gap-3 border-t border-line pt-8">
          <Link href="/help?tab=inquiry" className="flex min-h-11 items-center justify-between text-sm hover:text-text">
            문의 내역 · 고객센터 <span aria-hidden="true">›</span>
          </Link>
          <form action={signOut}>
            <button type="submit" className="min-h-11 rounded-full border border-line px-5 text-sm font-semibold text-quiet hover:border-quiet hover:text-text">
              로그아웃
            </button>
          </form>
        </section>

        <nav aria-label="정책" className="flex gap-4 border-t border-line pt-6 text-sm text-quiet">
          <Link href="/terms" className="hover:text-text">
            이용약관
          </Link>
          <Link href="/privacy" className="font-semibold hover:text-text">
            개인정보처리방침
          </Link>
        </nav>
      </div>
    </div>
  );
}

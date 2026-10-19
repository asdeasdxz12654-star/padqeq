import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { turnstileSiteKey } from "@/lib/security/turnstile";
import { getSiteSwitches } from "@/lib/support/switches";
import { signOutToLogin } from "@/app/me/actions";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = {
  title: "가입 마무리",
  robots: { index: false },
};

// S-01 ② — 1단계(1인 운영)는 역할 선택 없이 핸들만 받는다
export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const next = safeNextPath((await searchParams).next);
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", next));
  if (viewer.profile) redirect(next);

  const switches = await getSiteSwitches();
  if (switches.signupClosed || switches.readOnly) {
    return (
      <div className="mx-auto max-w-sm px-4 py-24 text-center">
        <h1 className="text-xl font-bold">지금은 가입을 잠시 멈췄어요</h1>
        <p className="mt-2 text-sm leading-relaxed text-quiet">운영 점검 중이에요. 곧 다시 열릴 예정이니 조금 뒤에 다시 와 주세요.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 pt-10 pb-16 md:pt-16">
      <h1 className="text-2xl font-bold">거의 다 됐어요</h1>
      <p className="mt-2 text-sm text-quiet">해담에서 쓸 이름을 정해 주세요.</p>
      {/* 다른 로그인 방법으로 이미 가입한 사람이 두 번째 계정을 만들지 않게 */}
      <div className="mt-4 rounded-xl border border-line px-4 py-3 text-sm leading-relaxed">
        <p>
          이미 해담 계정이 있나요? 처음 가입한 방법으로 로그인한 뒤 <strong>설정 › 로그인 방법</strong>에서 이 계정을 연결하면 어느 쪽으로 들어와도 같은 계정이 돼요.
        </p>
        <form action={signOutToLogin} className="mt-1">
          <button type="submit" className="min-h-10 text-sm font-semibold underline underline-offset-4">
            로그아웃하고 다른 방법으로 로그인
          </button>
        </form>
      </div>
      <WelcomeForm next={next} loginMethod={viewer.loginMethod} suggestedName={viewer.suggestedName} today={todayKst()} turnstileSiteKey={turnstileSiteKey()} />
    </div>
  );
}

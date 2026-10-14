import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { getSiteSwitches } from "@/lib/support/switches";
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
      <WelcomeForm next={next} suggestedName={viewer.suggestedName} today={todayKst()} />
    </div>
  );
}

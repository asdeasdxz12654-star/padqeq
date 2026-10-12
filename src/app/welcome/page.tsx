import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
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

  return (
    <div className="mx-auto max-w-sm px-4 pt-10 pb-16 md:pt-16">
      <h1 className="text-2xl font-bold">거의 다 됐어요</h1>
      <p className="mt-2 text-sm text-quiet">해담에서 쓸 이름을 정해 주세요.</p>
      <WelcomeForm next={next} suggestedName={viewer.suggestedName} today={todayKst()} />
    </div>
  );
}

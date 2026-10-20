import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { IntroCards } from "./intro-cards";

export const metadata: Metadata = { title: "해담 소개", robots: { index: false } };

// S-01 가입 직후 소개 (건너뛸 수 있음). 핸들 입력(/welcome) 다음, 관심 고르기(/welcome/interests) 앞.
// 회원 시안 46 ③: 해담에만 있는 것 셋을 한 장씩 — 해마다 담기 · 크레딧 · 지켜요.
// 자세한 내용은 /guide 로 넘긴다 (가입 흐름을 길게 만들지 않는다).
export default async function IntroPage({ searchParams }: PageProps<"/welcome/intro">) {
  const next = safeNextPath((await searchParams).next);
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", next));
  if (!viewer.profile) redirect(withNext("/welcome", next));

  const interests = next === "/" ? "/welcome/interests" : `/welcome/interests?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 pt-10 pb-16 md:pt-16">
      <h1 className="text-2xl font-bold">해담에 오신 걸 환영해요</h1>
      <IntroCards doneHref={interests} />
      <p className="text-center text-sm text-quiet">
        더 알고 싶다면{" "}
        <Link href="/guide" className="underline underline-offset-2">
          이용 가이드
        </Link>
        를 보세요.
      </p>
    </div>
  );
}

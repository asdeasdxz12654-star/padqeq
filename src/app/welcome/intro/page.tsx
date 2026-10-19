import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "해담 소개", robots: { index: false } };

// S-01 가입 직후 소개 (건너뛸 수 있음). 핸들 입력(/welcome) 다음, 관심 고르기(/welcome/interests) 앞.
// 해담에만 있는 규칙 셋만 먼저 알린다: 내려받기가 없다 · 크레딧을 함께 남긴다 · 태그로 찾는다.
// 자세한 내용은 /guide 로 넘긴다 (가입 흐름을 길게 만들지 않는다).

const CARDS = [
  {
    title: "담아 두고, 다시 꺼내 봐요",
    body: "그해의 코스프레 · 인물 · 풍경 사진을 모아 두는 갤러리예요. 촬영 연도 · 작품 · 장소로 묶여서 나중에 다시 찾기 좋아요.",
  },
  {
    title: "사진은 내려받을 수 없어요",
    body: "찍은 분과 사진에 나온 분을 지키기 위해서예요. 마음에 드는 사진은 '저장'으로 모아 두면 언제든 다시 볼 수 있어요.",
  },
  {
    title: "함께 만든 사람을 남겨요",
    body: "사진마다 코스어 · 모델 · 촬영 · 보정을 크레딧으로 적어요. 나를 표시한 크레딧은 마이 화면에서 승인하면 내 프로필에 모여요.",
  },
];

export default async function IntroPage({ searchParams }: PageProps<"/welcome/intro">) {
  const next = safeNextPath((await searchParams).next);
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", next));
  if (!viewer.profile) redirect(withNext("/welcome", next));

  const interests = next === "/" ? "/welcome/interests" : `/welcome/interests?next=${encodeURIComponent(next)}`;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-8 px-4 pt-10 pb-16 md:pt-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">해담에 오신 걸 환영해요</h1>
        <p className="text-sm leading-relaxed text-quiet">먼저 세 가지만 알려 드릴게요.</p>
      </header>

      <ul className="flex flex-col gap-4">
        {CARDS.map((card) => (
          <li key={card.title} className="rounded-xl border border-line p-4">
            <h2 className="font-semibold">{card.title}</h2>
            <p className="mt-1 text-sm leading-relaxed text-quiet">{card.body}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-3">
        <Link href={interests} className="flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-on-accent">
          다음
        </Link>
        <Link href={interests} className="flex min-h-12 items-center justify-center text-sm text-quiet">
          건너뛰기
        </Link>
      </div>

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

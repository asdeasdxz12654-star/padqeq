import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FollowButton } from "@/components/follow-button";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowedMembers, getFollowedTags } from "@/lib/follows/follows";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-input";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { InterestPicker } from "@/app/settings/interest-picker";

export const metadata: Metadata = { title: "관심 고르기", robots: { index: false } };

// S-01 ⑤ ⑥ ⑦ 가입 직후 (고르지 않아도 된다): 관심 분야는 홈 '추천' 순서에 반영되고,: 요즘 많이 담기는 작품 · 직접 올리는 크리에이터를 팔로우하면 홈 '팔로우' 피드가 채워진다.
// 관심 분야는 늘 고를 수 있고, 작품 · 크리에이터는 있을 때만 보여 준다.
export default async function InterestsPage({ searchParams }: PageProps<"/welcome/interests">) {
  const next = safeNextPath((await searchParams).next);
  const viewer = await getViewer();
  if (!viewer) redirect(withNext("/login", next));
  if (!viewer.profile) redirect(withNext("/welcome", next));

  const supabase = await createClient();
  const [{ data: trending }, { data: creators }, followedTags, followedMembers, { data: me }] = await Promise.all([
    supabase.rpc("trending_works", { days: 90, max_rows: 12 }),
    supabase.rpc("creator_directory", { max_rows: 9 }),
    getFollowedTags(viewer.id),
    getFollowedMembers(viewer.id),
    supabase.rpc("my_settings").maybeSingle(),
  ]);
  // 요즘 담기는 작품이 없으면 공식 작품 태그를 이름순으로
  const works = trending?.length
    ? trending.map((w) => ({ id: w.id, slug: w.slug, name: w.name, count: w.total_count }))
    : ((await supabase.from("tags").select("id, slug, name").eq("kind", "work").eq("status", "official").order("name").limit(12)).data ?? []).map((w) => ({
        ...w,
        count: null,
      }));
  const people = (creators ?? []).filter((c) => c.user_id !== viewer.id).slice(0, 8);

  const tagIds = new Set(followedTags.map((t) => t.id));
  const memberIds = new Set(followedMembers.map((m) => m.id));
  const row = "flex min-h-14 items-center gap-3 rounded-xl border border-line px-3 py-2";

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 pt-10 pb-16 md:pt-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">관심 있는 것을 골라 보세요</h1>
        <p className="text-sm leading-relaxed text-quiet">
          팔로우하면 홈의 &lsquo;팔로우&rsquo;에 새 사진이 모여요. 고르지 않아도 되고, 나중에 태그 · 프로필 화면에서 언제든 바꿀 수 있어요.
        </p>
      </header>

      <section aria-labelledby="fields-heading" className="flex flex-col gap-2">
        <h2 id="fields-heading" className="font-semibold">
          관심 분야
        </h2>
        <p className="text-xs text-quiet">고른 분야의 사진이 홈 &lsquo;추천&rsquo;에서 조금 더 위에 나와요.</p>
        <InterestPicker initial={me?.interest_categories ?? []} />
      </section>

      {works.length > 0 && (
        <section aria-labelledby="works-heading" className="flex flex-col gap-2">
          <h2 id="works-heading" className="font-semibold">
            요즘 많이 담는 작품
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {works.map((w) => (
              <li key={w.id} className={row}>
                <Link href={`/t/${encodeURIComponent(w.slug)}`} className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{w.name}</span>
                  {w.count !== null && <span className="text-xs text-quiet">게시물 {w.count}</span>}
                </Link>
                <FollowButton target={{ kind: "tag", id: w.id }} initial={tagIds.has(w.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {people.length > 0 && (
        <section aria-labelledby="people-heading" className="flex flex-col gap-2">
          <h2 id="people-heading" className="font-semibold">
            직접 올리는 크리에이터
          </h2>
          <ul className="flex flex-col gap-2">
            {people.map((c) => (
              <li key={c.user_id} className={row}>
                <Link href={profileHref(c.handle)} className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    @{c.handle} <span className="font-normal text-quiet">{c.display_name}</span>
                  </span>
                  <span className="block truncate text-xs text-quiet">
                    {[...c.roles.map((r) => CREDIT_ROLE_LABEL[r]), c.region].filter(Boolean).join(" · ")}
                  </span>
                </Link>
                <FollowButton target={{ kind: "member", id: c.user_id }} initial={memberIds.has(c.user_id)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-col gap-3">
        <Link href={next} className="flex min-h-12 items-center justify-center rounded-xl bg-accent font-semibold text-on-accent">
          시작하기
        </Link>
        <p className="text-center text-sm text-quiet">
          해담이 처음이라면{" "}
          <Link href="/guide" className="underline underline-offset-2">
            이용 가이드
          </Link>
          를 먼저 보세요.
        </p>
      </div>
    </div>
  );
}

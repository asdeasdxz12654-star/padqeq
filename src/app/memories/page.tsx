import type { Metadata } from "next";
import Link from "next/link";
import { PhotoFeed } from "@/components/photo-feed";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { getFollowedMembers } from "@/lib/follows/follows";
import { loadFeedByIds } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "N년 전 오늘" };

// S-18 N년 전 오늘: 오늘과 같은 월 · 일에 찍은 지난해 사진을 해마다 묶어서. 사진이 없으면 그 주(앞뒤 3일)로 넓혀 본다.

const SCOPES = { all: "전체", mine: "내 사진", credited: "크레딧된 사진", following: "팔로잉" } as const;
type Scope = keyof typeof SCOPES;

export default async function MemoriesPage({ searchParams }: PageProps<"/memories">) {
  const params = await searchParams;
  const viewer = await getViewer();
  const today = todayKst();
  const week = params.span === "week";
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("on_this_day", { target: today, span: week ? 3 : 0, max_rows: 40 });
  if (error) throw error;
  const yearsAgo = new Map(data.map((r) => [r.post_id, r.years_ago]));
  const ids = [...yearsAgo.keys()];

  // 범위 판단용: 글쓴이 · 내 크레딧 · 팔로우
  const [{ data: authors }, { data: myCredits }, followed] = await Promise.all([
    ids.length ? supabase.from("posts").select("id, author_id").in("id", ids) : Promise.resolve({ data: [] as { id: string; author_id: string }[] }),
    viewer?.profile && ids.length
      ? supabase.from("credits").select("post_id").eq("member_id", viewer.id).eq("status", "approved").in("post_id", ids)
      : Promise.resolve({ data: [] as { post_id: string }[] }),
    viewer?.profile ? getFollowedMembers(viewer.id) : Promise.resolve([]),
  ]);
  const authorOf = new Map((authors ?? []).map((a) => [a.id, a.author_id]));
  const credited = new Set((myCredits ?? []).map((c) => c.post_id));
  const followedIds = new Set(followed.map((m) => m.id));
  const inScope: Record<Scope, (id: string) => boolean> = {
    all: () => true,
    mine: (id) => authorOf.get(id) === viewer?.id,
    credited: (id) => credited.has(id),
    following: (id) => followedIds.has(authorOf.get(id) ?? ""),
  };

  // 기본: 내 사진이 있으면 내 사진, 없으면 전체 (S-18 ①)
  const requested = typeof params.scope === "string" && params.scope in SCOPES ? (params.scope as Scope) : null;
  const scope: Scope = requested ?? (viewer?.profile && ids.some(inScope.mine) ? "mine" : "all");
  const scopedIds = ids.filter(inScope[scope]);
  const feed = await loadFeedByIds(scopedIds);
  const years = [...new Set(feed.map((f) => yearsAgo.get(f.id)!))].sort((a, b) => a - b);

  const [, month, day] = today.split("-").map(Number);
  const href = (next: { scope?: Scope; week?: boolean }) => {
    const q = new URLSearchParams();
    const s = next.scope ?? scope;
    if (s !== "all" || requested) q.set("scope", s);
    if (next.week ?? week) q.set("span", "week");
    return `/memories${q.size ? `?${q}` : ""}`;
  };
  const chip = "rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg";
  const scopes = (Object.keys(SCOPES) as Scope[]).filter((s) => s === "all" || viewer?.profile);

  return (
    <div className="mx-auto max-w-[1440px] pt-8 pb-16">
      <header className="px-4 md:px-6">
        <h1 className="text-2xl font-bold">
          {month}월 {day}일의 기억
        </h1>
        <p className="mt-1 text-sm text-quiet">{week ? "그 주(앞뒤 3일)에 찍은 지난해 사진이에요." : "예전 오늘 찍은 사진을 해마다 모아 봐요."}</p>
        <nav aria-label="범위" className="mt-4 flex flex-wrap gap-2 text-sm">
          {scopes.map((s) => (
            <Link key={s} href={href({ scope: s })} aria-current={scope === s ? "page" : undefined} className={chip}>
              {SCOPES[s]}
            </Link>
          ))}
          <Link href={href({ week: !week })} aria-current={week ? "page" : undefined} className={chip}>
            그 주까지 넓혀 보기
          </Link>
        </nav>
      </header>

      {years.length === 0 ? (
        <div className="px-4 py-20 text-center text-sm text-quiet md:px-6">
          <p>{week ? "그 주에도 담긴 사진이 없어요." : "예전 오늘에는 사진이 없어요."}</p>
          {!week && (
            <Link href={href({ week: true })} className="mt-2 inline-flex min-h-10 items-center underline underline-offset-4">
              그 주의 사진 보기
            </Link>
          )}
        </div>
      ) : (
        years.map((y) => (
          <section key={y} aria-labelledby={`years-${y}`} className="mt-8">
            <h2 id={`years-${y}`} className="mb-3 px-4 text-lg font-semibold md:px-6">
              {y}년 전 <span className="text-sm font-normal text-quiet">· {Number(today.slice(0, 4)) - y}</span>
            </h2>
            <PhotoFeed items={feed.filter((f) => yearsAgo.get(f.id) === y)} empty="" />
          </section>
        ))
      )}
    </div>
  );
}

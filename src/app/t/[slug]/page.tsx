import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { FollowButton } from "@/components/follow-button";
import { FeedList } from "@/components/feed-list";
import { MiniMap } from "@/components/mini-map";
import { PhotoFeed } from "@/components/photo-feed";
import { TagChip } from "@/components/tag-chip";
import { YearChips } from "@/components/year-chips";
import { getViewer } from "@/lib/auth/viewer";
import { loadFeedByIds } from "@/lib/posts/feed";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { getFollowedTags } from "@/lib/follows/follows";
import { profileHref } from "@/lib/profiles/profile-href";
import { formatRange } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";
import { LocationForm } from "./location-form";
import { type MergeCandidate, MergeForm } from "./merge-form";
import { TAG_KIND_LABEL } from "@/lib/tags/tag-rules";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

// S-05 태그 허브: 계층(작품 › 캐릭터) · 별칭 · 캐릭터 목록 · 관련 태그 · 최신 / 인기 / 코스어 탭 · 촬영 연도.
// 태그 팔로우는 홈 '팔로우' 피드로 이어진다.

const getTag = cache(async (rawSlug: string) => {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug).normalize("NFC");
  } catch {
    return null;
  }
  if (slug.length > 60) return null;
  const supabase = await createClient();
  // 볼 수 있는 태그만 (공식 · 내 제안 · 운영자, RLS)
  const { data: tag } = await supabase
    .from("tags")
    .select("id, kind, slug, name, status, parent_id, lat, lng, tag_aliases(alias)")
    .eq("slug", slug)
    .maybeSingle();
  if (!tag) {
    // 합쳐서 없어진 태그의 예전 주소면 남은 태그로
    const { data: moved } = await supabase.from("tag_slug_redirects").select("tag:tags(slug)").eq("old_slug", slug).maybeSingle();
    return moved?.tag ? { moved: true as const, slug: moved.tag.slug } : null;
  }

  const [parent, children] = await Promise.all([
    tag.parent_id
      ? supabase.from("tags").select("slug, name, kind").eq("id", tag.parent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    tag.kind === "work"
      ? supabase.from("tags").select("id, slug, name, kind").eq("parent_id", tag.id).order("name").limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  return { ...tag, moved: false as const, parent: parent.data, children: children.data ?? [] };
});

export async function generateMetadata({ params }: PageProps<"/t/[slug]">): Promise<Metadata> {
  const tag = await getTag((await params).slug);
  if (!tag || tag.moved) return { title: "찾을 수 없는 태그", robots: { index: false } };
  return {
    title: tag.parent ? `${tag.parent.name} › ${tag.name}` : tag.name,
    robots: tag.status === "official" ? undefined : { index: false },
  };
}

export default async function TagHubPage({ params, searchParams }: PageProps<"/t/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tag = await getTag(slug);
  if (!tag) notFound();
  if (tag.moved) permanentRedirect(`/t/${encodeURIComponent(tag.slug)}`);
  const year = parseYearParam(query.year);
  const base = `/t/${encodeURIComponent(tag.slug)}`;

  const supabase = await createClient();
  // 허브 탭 (S-04 ⑧): 최신 · 인기(최근 30일 좋아요) · 코스어(작품 · 캐릭터)
  const showCosers = tag.kind === "work" || tag.kind === "character";
  const view = query.view === "popular" ? "popular" : query.view === "cosers" && showCosers ? "cosers" : "latest";
  // 최신: 작품 허브에는 그 작품 캐릭터 사진도 함께
  const scope: FeedScope = { kind: "tag", tagId: tag.id, year };
  const [years, first, viewer, popular, cosers, related, placeEvents] = await Promise.all([
    supabase.rpc("published_shot_years"),
    view === "latest" ? loadScopePage(scope) : Promise.resolve({ items: [], next: null }),
    getViewer(),
    view === "popular" ? popularPosts(tag.id) : Promise.resolve([]),
    view === "cosers" ? supabase.rpc("tag_cosers", { tag: tag.id }).then((r) => r.data ?? []) : Promise.resolve([]),
    // 관련 태그 (S-04 ⑨): 같은 글에 함께 많이 붙는 태그
    supabase.rpc("related_tags", { tag: tag.id, max_rows: 8 }).then((r) => r.data ?? []),
    // 장소 태그: 이 곳에서 열리는 · 열린 공식 행사 (최근 것부터)
    tag.kind === "place"
      ? supabase
          .from("events")
          .select("id, name, starts_on, ends_on")
          .eq("place_tag_id", tag.id)
          .eq("status", "official")
          .order("starts_on", { ascending: false })
          .limit(20)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
  ]);
  const viewHref = (v: "latest" | "popular" | "cosers") => (v === "latest" ? base : `${base}?view=${v}`);
  const following = viewer?.profile ? (await getFollowedTags(viewer.id)).some((t) => t.id === tag.id) : false;
  // 태그 관리 › 비슷한 이름에서 넘어오면 남길 태그를 미리 골라 둔다
  const mergeTarget = typeof query.merge === "string" ? query.merge : "";
  // 합칠 대상: 같은 종류의 공식 태그 (최고 관리자만 본다)
  const mergeCandidates: MergeCandidate[] | null =
    viewer?.profile?.role === "admin"
      ? ((await supabase.from("tags").select("id, name, slug").eq("kind", tag.kind).eq("status", "official").neq("id", tag.id).order("name").limit(500)).data ?? [])
      : null;
  if (years.error) throw years.error;

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-2 px-4 pt-6 md:px-6">
        <nav aria-label="태그 위치" className="text-sm text-quiet">
          <Link href="/explore" className="hover:text-text">
            탐색
          </Link>
          {tag.parent && (
            <>
              {" › "}
              <Link href={`/t/${encodeURIComponent(tag.parent.slug)}`} className="hover:text-text">
                {tag.parent.name}
              </Link>
            </>
          )}
          {" › "}
          <span>{TAG_KIND_LABEL[tag.kind]}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-bold">{tag.kind === "general" ? `#${tag.name}` : tag.name}</h1>
          {viewer?.profile ? (
            <FollowButton target={{ kind: "tag", id: tag.id }} initial={following} />
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(base)}`}
              className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent"
            >
              팔로우
            </Link>
          )}
        </div>
        {tag.tag_aliases.length > 0 && (
          <p className="text-sm text-quiet">다른 표기: {tag.tag_aliases.map((a) => a.alias).join(" · ")}</p>
        )}
        {tag.status === "pending" && <p className="text-xs text-quiet">운영자 승인 대기 중인 태그예요.</p>}
        {tag.lat !== null && tag.lng !== null && tag.status === "official" && (
          <div className="max-w-xl">
            <MiniMap deferred point={{ lat: tag.lat, lng: tag.lng }} label={`${tag.name} 위치 지도`} />
          </div>
        )}
        {tag.lat !== null && tag.status === "official" && (
          <p className="text-sm">
            <Link href={`/map?focus=${encodeURIComponent(tag.slug)}`} className="text-quiet underline underline-offset-2 hover:text-text">
              지도에서 보기
            </Link>
          </p>
        )}
        {placeEvents.length > 0 && (
          <section aria-labelledby="place-events-heading" className="max-w-xl text-sm">
            <h2 id="place-events-heading" className="mb-1 font-semibold">
              이 장소의 행사
            </h2>
            <ul className="flex flex-col">
              {placeEvents.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="flex min-h-11 items-center gap-3 hover:underline">
                    <span className="w-28 shrink-0 tabular-nums text-quiet">
                      {e.starts_on.slice(0, 4)}. {formatRange(e.starts_on, e.ends_on)}
                    </span>
                    <span className="min-w-0 break-words">{e.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {(tag.kind === "place" || tag.kind === "event") && isStaffRole(viewer?.profile?.role) && (
          <details className="rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">지도 위치 (운영자)</summary>
            <LocationForm tagId={tag.id} tagName={tag.name} current={tag.lat !== null && tag.lng !== null ? { lat: tag.lat, lng: tag.lng } : null} />
          </details>
        )}
        {mergeCandidates && (
          <details id="merge" open={mergeTarget !== ""} className="scroll-mt-20 rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">중복 태그 합치기 (최고 관리자)</summary>
            <MergeForm tagId={tag.id} tagName={tag.name} candidates={mergeCandidates} initialTargetId={mergeTarget} />
          </details>
        )}
      </header>

      {tag.children.length > 0 && (
        <nav aria-label="캐릭터" className="px-4 pt-4 md:px-6">
          <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {tag.children.map((c) => (
              <li key={c.id} className="shrink-0">
                <TagChip tag={c} />
              </li>
            ))}
          </ul>
        </nav>
      )}

      {related.length > 0 && (
        <nav aria-label="관련 태그" className="px-4 pt-4 md:px-6">
          <h2 className="mb-2 text-xs text-quiet">함께 많이 붙는 태그</h2>
          <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {related.map((t) => (
              <li key={t.id} className="shrink-0">
                <TagChip tag={t} showKind={t.kind !== "general"} />
              </li>
            ))}
          </ul>
        </nav>
      )}

      <nav aria-label="보기" className="flex gap-2 px-4 pt-4 text-sm md:px-6">
        {(["latest", "popular", ...(showCosers ? (["cosers"] as const) : [])] as const).map((v) => (
          <Link
            key={v}
            href={viewHref(v)}
            aria-current={view === v ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            {v === "latest" ? "최신" : v === "popular" ? "인기" : "코스어"}
          </Link>
        ))}
      </nav>

      {view === "latest" && (
        <>
          <YearChips
            chips={buildYearChips(years.data.map((r) => r.year))}
            selected={year}
            hrefFor={(y) => (y === null ? base : `${base}?year=${y}`)}
          />
          <FeedList
            key={JSON.stringify(scope)}
            scope={scope}
            initial={first}
            empty={year ? `${year}년의 ${tag.name} 사진이 아직 없어요.` : `${tag.name} 사진이 아직 없어요.`}
          />
        </>
      )}

      {view === "popular" && (
        <div className="pt-4">
          <p className="px-4 pb-3 text-xs text-quiet md:px-6">최근 30일 동안 좋아요를 많이 받은 순서예요.</p>
          <PhotoFeed items={popular} empty="최근 30일 동안 좋아요를 받은 사진이 없어요." />
        </div>
      )}

      {view === "cosers" && (
        <section aria-label="코스어" className="px-4 pt-4 md:px-6">
          <p className="pb-3 text-xs text-quiet">이 태그가 붙은 사진에 코스어로 크레딧된 회원이에요.</p>
          {cosers.length === 0 ? (
            <p className="py-12 text-center text-sm text-quiet">아직 크레딧된 코스어가 없어요.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {cosers.map((c) => (
                <li key={c.handle}>
                  <Link href={profileHref(c.handle)} className="flex items-baseline gap-2 rounded-xl border border-line px-3 py-2.5 hover:border-quiet">
                    <span className="font-semibold">@{c.handle}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-quiet">{c.display_name}</span>
                    <span className="shrink-0 text-xs text-quiet">{c.posts}장</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** 인기 (최근 30일 좋아요 순, 볼 수 있는 글만) */
async function popularPosts(tagId: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("tag_popular_posts", { tag: tagId, days: 30, max_rows: 40 });
  if (!data?.length) return [];
  return loadFeedByIds(data.map((r) => r.post_id));
}

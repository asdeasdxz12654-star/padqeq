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
import { YearCompare } from "@/components/year-compare";
import { type YearCover, YearsStrip } from "@/components/years-strip";
import { getViewer } from "@/lib/auth/viewer";
import { type FeedItem, loadFeedByIds } from "@/lib/posts/feed";
import { ProtectedPhoto } from "@/components/protected-photo";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";
import { getFollowedTags } from "@/lib/follows/follows";
import { profileHref } from "@/lib/profiles/profile-href";
import { formatRange } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole } from "@/lib/auth/roles";
import { LocationForm } from "./location-form";
import { GuideForm } from "./guide-form";
import { GUIDE_FIELDS, type PlaceGuide } from "@/lib/places/guide";
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
  const [years, first, viewer, popular, cosers, related, placeEvents, guideRow] = await Promise.all([
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
    // 촬영지 가이드 (공식 장소 태그)
    tag.kind === "place" && tag.status === "official"
      ? supabase.from("place_guides").select("best_time, fee, tripod, parking, tip, updated_at").eq("tag_id", tag.id).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
  ]);
  const guide: PlaceGuide = {
    bestTime: guideRow?.best_time ?? "",
    fee: guideRow?.fee ?? "",
    tripod: guideRow?.tripod ?? "",
    parking: guideRow?.parking ?? "",
    tip: guideRow?.tip ?? "",
  };
  // 캐릭터 도감 (작품 태그): 캐릭터마다 가장 최근 사진 한 장
  const dex = tag.children.length > 0 && view === "latest" ? await characterCovers(tag.children.map((c) => c.id)) : new Map<string, FeedItem>();
  const viewHref = (v: "latest" | "popular" | "cosers") => (v === "latest" ? base : `${base}?view=${v}`);
  const following = viewer?.profile ? (await getFollowedTags(viewer.id)).some((t) => t.id === tag.id) : false;
  // 태그 관리 › 비슷한 이름에서 넘어오면 남길 태그를 미리 골라 둔다
  const mergeTarget = typeof query.merge === "string" ? query.merge : "";
  // 합칠 대상: 같은 종류의 태그 (확인 전 새 태그 포함, 최고 관리자만 본다)
  const mergeCandidates: MergeCandidate[] | null =
    viewer?.profile?.role === "admin"
      ? ((await supabase.from("tags").select("id, name, slug").eq("kind", tag.kind).neq("id", tag.id).order("name").limit(500)).data ?? [])
      : null;
  if (years.error) throw years.error;

  // 같은 자리, 다른 해: 이 태그가 붙은 사진의 촬영 연도 (행사 태그는 회차마다 따로라 빼고), 해마다 한 장
  let yearCovers: YearCover[] = [];
  if (view === "latest" && year === null && tag.kind !== "event") {
    const { data: shot } = await supabase
      .from("posts")
      .select("shot_year, post_tags!inner(tag_id)")
      .eq("post_tags.tag_id", tag.id)
      .eq("status", "published")
      .limit(2000);
    const tagYears = [...new Set((shot ?? []).map((r) => r.shot_year))].sort((a, b) => b - a).slice(0, 8);
    if (tagYears.length >= 2) {
      yearCovers = await Promise.all(
        tagYears.map(async (y) => ({ year: y, cover: (await loadScopePage({ kind: "tag", tagId: tag.id, year: y })).items[0] ?? null })),
      );
    }
  }
  const stripTitle =
    tag.kind === "place" ? "같은 자리, 다른 해" : tag.kind === "character" ? "해마다 같은 캐릭터" : "해마다 담긴 " + tag.name;
  // 밀어 비교 (시안 24): 가장 오래된 해 ↔ 가장 최근 해.
  // 가림 표시가 붙은 사진은 눌러야 보이므로 겹쳐 보기에 쓰지 않는다.
  const open = yearCovers.filter((y) => y.cover?.cover && !y.cover.cover.veil);
  const compare = open.length >= 2 ? { newer: open[0]!, older: open[open.length - 1]! } : null;

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
        {guideRow && (
          <section aria-labelledby="guide-heading" className="max-w-xl rounded-xl border border-line p-4 text-sm">
            <h2 id="guide-heading" className="mb-2 font-semibold">
              촬영지 가이드
            </h2>
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
              {GUIDE_FIELDS.filter((f) => guide[f.key]).map((f) => (
                <div key={f.key} className="contents">
                  <dt className="text-quiet">{f.label}</dt>
                  <dd>{guide[f.key]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-quiet">운영자가 확인한 정보예요. 현장 사정에 따라 바뀔 수 있어요.</p>
          </section>
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
        {tag.kind === "place" && tag.status === "official" && isStaffRole(viewer?.profile?.role) && (
          <details className="rounded-xl border border-line p-3 text-sm">
            <summary className="cursor-pointer font-semibold">촬영지 가이드 고치기 (운영자)</summary>
            <GuideForm tagId={tag.id} initial={guide} />
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
        <nav aria-labelledby="dex-heading" className="mt-5 border-t border-line px-4 pt-5 md:px-6">
          <h2 id="dex-heading" className="mb-2 text-sm font-semibold">
            캐릭터 도감 <span className="font-normal text-quiet">{tag.children.length}</span>
          </h2>
          {/* 캐릭터마다 가장 최근 사진 한 장. 사진이 있는 캐릭터부터. */}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {tag.children
              .toSorted((a, b) => Number(dex.has(b.id)) - Number(dex.has(a.id)))
              .map((c) => {
                const cover = dex.get(c.id)?.cover;
                return (
                  <li key={c.id}>
                    <Link
                      prefetch={false}
                      href={`/t/${encodeURIComponent(c.slug)}`}
                      className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-slot"
                    >
                      {cover && !cover.veil && (
                        <div className="absolute inset-0 [&_picture]:h-full">
                          <ProtectedPhoto sources={cover.sources} alt="" width={cover.width} height={cover.height} sizes="160px" className="block size-full object-cover" />
                        </div>
                      )}
                      <span className={`absolute inset-x-0 bottom-0 px-2 py-1.5 text-xs font-bold ${cover && !cover.veil ? "bg-black/55 text-white" : "text-text"}`}>
                        <span className="line-clamp-2 break-keep">{c.name}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </nav>
      )}

      {related.length > 0 && (
        <nav aria-label="관련 태그" className="mt-4 border-t border-line px-4 pt-4 md:px-6">
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
          {compare && (
            <section aria-labelledby="compare-heading" className="px-4 pt-6 md:px-6">
              <h2 id="compare-heading" className="text-lg font-bold">
                {stripTitle}
              </h2>
              <p className="mb-3 text-sm text-quiet">
                {compare.older.year}년과 {compare.newer.year}년을 겹쳐 봐요.
              </p>
              <div className="max-w-xl">
                <YearCompare
                  older={{ year: compare.older.year, item: compare.older.cover! }}
                  newer={{ year: compare.newer.year, item: compare.newer.cover! }}
                />
              </div>
            </section>
          )}
          {/* 비교를 띄웠으면 아래 줄은 '다른 해 고르기' 노릇을 한다 (시안 24의 해 줄) */}
          <YearsStrip
            title={compare ? "해마다 한 장씩" : stripTitle}
            sub="누르면 그해 사진만 봐요"
            years={yearCovers}
            hrefFor={(y) => `${base}?year=${y}`}
          />
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

/** 캐릭터마다 가장 최근에 게시된 사진 한 장 (볼 수 있는 글만) */
async function characterCovers(tagIds: string[]): Promise<Map<string, FeedItem>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("id, post_tags!inner(tag_id)")
    .in("post_tags.tag_id", tagIds)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(400);
  const firstPost = new Map<string, string>();
  for (const row of data ?? []) for (const t of row.post_tags) if (!firstPost.has(t.tag_id)) firstPost.set(t.tag_id, row.id);
  const items = new Map((await loadFeedByIds([...firstPost.values()])).map((p) => [p.id, p]));
  const covers = new Map<string, FeedItem>();
  for (const [tagId, postId] of firstPost) {
    const item = items.get(postId);
    if (item) covers.set(tagId, item);
  }
  return covers;
}

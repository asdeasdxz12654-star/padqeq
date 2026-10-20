import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { BlockButton } from "@/components/block-button";
import { CollectionCards } from "@/components/collection-cards";
import { ShareButton } from "@/components/share-button";
import { FollowButton } from "@/components/follow-button";
import { FeedList } from "@/components/feed-list";
import { ProtectedPhoto } from "@/components/protected-photo";
import { TogetherTimeline } from "@/components/together-timeline";
import { YearBook } from "@/components/year-book";
import { YearShelf } from "@/components/year-shelf";
import { getViewer } from "@/lib/auth/viewer";
import { loadCollectionCards } from "@/lib/collections/load";
import { loadYearShelf } from "@/lib/profiles/shelf";
import { getFollowedMembers } from "@/lib/follows/follows";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-roles";
import { loadFeedByIds } from "@/lib/posts/feed";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { creditedPostIds, loadScopePage } from "@/lib/posts/feed-scope-server";
import { loadPairings } from "@/lib/profiles/collaborators";
import { getProfileByHandle } from "@/lib/profiles/get-profile";
import { rankCollaborators, sharedPostIds } from "@/lib/profiles/rank-collaborators";
import { createClient } from "@/lib/supabase/server";
import { profileHref } from "@/lib/profiles/profile-href";
import { parseYearParam } from "@/lib/year-chips";

// S-09 프로필: 커버 · 소개 · 링크 · 크리에이터 정보 · 작업물 / 크레딧된 작업 / 컬렉션 · 촬영 연도. 주소는 /@handle (next.config.ts에서 연결)
// 팔로우는 홈 '팔로우' 피드로 이어진다 (팔로워 수는 공개하지 않음).

const yearFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" });

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const profile = await getProfileByHandle((await params).handle);
  if (!profile) return { title: "찾을 수 없는 프로필", robots: { index: false } };
  return {
    title: `${profile.display_name} (@${profile.handle})`,
    description: profile.bio || `해담의 @${profile.handle}`,
    alternates: { canonical: profileHref(profile.handle) },
  };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[handle]">) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const [profile, viewer] = await Promise.all([getProfileByHandle(handle), getViewer()]);
  if (!profile) notFound();

  const year = parseYearParam(query.year);
  // 한 해를 펼쳤을 때의 달 목차 (연도를 골랐을 때만 뜻이 있다)
  const monthParam = Number(query.month);
  const month = year !== null && Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12 ? monthParam : null;
  // 탭: 작업물(직접 올린 글) · 크레딧된 작업(남이 올렸고 내가 승인한 글) (S-09 ⑤)
  const tab =
    query.tab === "credits"
      ? "credits"
      : query.tab === "collections"
        ? "collections"
        : query.tab === "characters"
          ? "characters"
          : query.tab === "together"
            ? "together"
            : "works";
  const isMe = viewer?.id === profile.id;
  const base = profileHref(profile.handle);
  const following = viewer?.profile && !isMe ? (await getFollowedMembers(viewer.id)).some((m) => m.id === profile.id) : false;

  const supabase = await createClient();
  const [creditedIds, collections, { data: creator }, { data: blockRow }] = await Promise.all([
    creditedPostIds(profile.id),
    loadCollectionCards(profile.id),
    supabase.from("creator_profiles").select("roles, region, active_since, works, casting_open, listed").eq("user_id", profile.id).maybeSingle(),
    viewer?.profile && !isMe
      ? supabase.from("blocks").select("blocked_id").eq("blocker_id", viewer.id).eq("blocked_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const iBlocked = Boolean(blockRow);
  // 자주 함께한 사람: 크레딧으로 이어진 회원 (섭외 · 팔로우로 이어지게)
  const pairings = await loadPairings(profile.id, creditedIds).catch(() => []);
  const collaborators = rankCollaborators(pairings, profile.handle);
  // 함께한 기록 (?with=핸들): 그 사람과 크레딧으로 함께 이름이 오른 글을 해마다
  const withHandle = typeof query.with === "string" ? query.with : null;
  const partner = withHandle && withHandle !== profile.handle ? pairings.find((p) => p.handle === withHandle) : undefined;
  const together = partner ? await loadFeedByIds(sharedPostIds(pairings, partner.handle)) : null;
  // 커버 · 고정 글 (볼 수 있는 것만)
  const featuredIds = [...new Set([...(profile.cover_post_id ? [profile.cover_post_id] : []), ...profile.pinned_post_ids])];
  const featured = await loadFeedByIds(featuredIds);
  const cover = featured.find((f) => f.id === profile.cover_post_id)?.cover ?? null;
  const pinned = profile.pinned_post_ids.flatMap((id) => featured.filter((f) => f.id === id));
  // 작업물: 고정 글을 맨 앞에(전체 보기일 때) · 크레딧된 작업: 남이 올린 글만
  const scope: FeedScope =
    tab === "credits" ? { kind: "credits", memberId: profile.id } : { kind: "author", authorId: profile.id, year, month };
  const first = tab === "collections" || tab === "together" ? { items: [], next: null } : await loadScopePage(scope);
  const tabClass =
    "inline-flex min-h-10 items-center border-b-2 border-transparent px-1 text-sm aria-[current=page]:border-text aria-[current=page]:font-semibold";
  // 이 회원이 사진을 올린 촬영 연도만 (S-09 ⑥)
  const years = profile.years.toSorted((a, b) => b - a);
  // 연도 책장: 해마다 표지 한 장 · 사진 · 행사 · 함께한 사람 (최근 12년까지, 표지는 한 번에)
  const shelf = tab === "works" ? await loadYearShelf(profile.id, years) : [];
  // 책장은 두 해 이상 담았을 때만 (한 해뿐이면 책 한 권만 덩그러니 남는다 — 바로 사진으로)
  const shelfYears = shelf.filter((y) => y.count > 0);
  // 빈 탭은 숨긴다: 캐릭터 태그가 붙은 글이 없으면 '캐릭터별', 컬렉션이 없으면 '컬렉션', 함께한 사람이 없으면 '함께한 사람'
  const hasCharacters = tab === "characters" || (await authorHasCharacters(profile.id));
  // 캐릭터별 (시안 23 프로필 탭): 이 회원이 올린 글에 붙은 캐릭터 태그를 많이 담은 순으로, 태그마다 한 장
  const characters = tab === "characters" ? await authorCharacters(profile.id) : [];
  // 한 해를 펼쳤으면 달 목차도 받는다 (속표지)
  const book =
    tab === "works" && year !== null
      ? await supabase.rpc("author_year_months", { author: profile.id, target_year: year }).then(({ data }) =>
          (data ?? []).map((m) => ({ month: m.month, posts: Number(m.posts), photos: Number(m.photos) })),
        )
      : [];

  return (
    <div className="mx-auto max-w-[1440px]">
      {cover && (
        <div className="aspect-[3/1] max-h-72 w-full overflow-hidden bg-slot md:mt-4 md:rounded-2xl [&_picture]:h-full">
          <ProtectedPhoto
            sources={cover.sources}
            alt=""
            width={cover.width}
            height={cover.height}
            sizes="100vw"
            priority
            className="block size-full object-cover"
          />
        </div>
      )}
      <header className="flex flex-col gap-3 px-4 pt-8 pb-2 md:px-6">
        <div className="flex items-center gap-4">
          <Avatar avatarKey={profile.avatar_key} size={64} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-xl font-bold">{profile.display_name}</h1>
              {isMe && (
                <Link
                  href="/settings"
                  className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-line px-2.5 text-xs text-quiet hover:border-quiet hover:text-text"
                >
                  프로필 수정
                </Link>
              )}
            </div>
            <p className="flex items-center gap-2 text-sm text-quiet">
              @{profile.handle}
              {profile.role === "admin" && (
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-text">운영자</span>
              )}
            </p>
          </div>
        </div>

        {creator?.listed && (
          <p className="flex flex-wrap gap-1.5 text-xs text-quiet">
            {creator.casting_open && <span className="rounded border border-accent px-1.5 py-0.5 text-accent">섭외 가능</span>}
            {creator.roles.map((r) => (
              <span key={r} className="rounded border border-line px-1.5 py-0.5">
                {CREDIT_ROLE_LABEL[r]}
              </span>
            ))}
            {creator.region && <span className="rounded border border-line px-1.5 py-0.5">{creator.region}</span>}
            {creator.active_since && <span className="rounded border border-line px-1.5 py-0.5">{creator.active_since}년부터</span>}
            {creator.works && <span className="px-1.5 py-0.5">{creator.works}</span>}
          </p>
        )}

        {profile.bio && <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed">{profile.bio}</p>}

        {profile.links.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {profile.links.map((link) => (
              <li key={link}>
                <a href={link} target="_blank" rel="nofollow noopener noreferrer ugc" className="text-quiet underline underline-offset-2 hover:text-text">
                  {link.replace(/^https:\/\/(www\.)?/, "").replace(/\/$/, "")}
                </a>
              </li>
            ))}
          </ul>
        )}

        <p className="text-sm text-quiet">
          게시물 <strong className="text-text">{profile.postCount}</strong> · {yearFormat.format(new Date(profile.created_at))}부터
        </p>

        {isMe ? (
          <div className="flex flex-wrap gap-2">
            <ShareButton path={base} title={`${profile.display_name} (@${profile.handle})`} />
          </div>
        ) : viewer?.profile ? (
          <div className="flex flex-wrap gap-2">
            <FollowButton target={{ kind: "member", id: profile.id }} initial={following} />
            {!iBlocked && (
              <Link
                href={`/me/messages/new?to=${encodeURIComponent(profile.handle)}`}
                className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm hover:border-quiet"
              >
                메시지
              </Link>
            )}
            {profile.role !== "admin" && <BlockButton userId={profile.id} handle={profile.handle} initial={iBlocked} />}
          </div>
        ) : (
          <Link
            href={`/login?next=${encodeURIComponent(base)}`}
            className="inline-flex min-h-10 items-center self-start rounded-full bg-accent px-4 text-sm font-semibold text-on-accent"
          >
            팔로우
          </Link>
        )}
      </header>

      {partner && together ? (
        <TogetherTimeline
          me={{ handle: profile.handle, displayName: profile.display_name }}
          other={{ handle: partner.handle, displayName: partner.displayName }}
          items={together}
          backHref={base}
        />
      ) : (
      <>
      <nav aria-label="프로필 탭" className="flex gap-6 border-b border-line px-4 md:px-6">
        <Link href={base} aria-current={tab === "works" ? "page" : undefined} className={tabClass}>
          작업물
        </Link>
        <Link href={`${base}?tab=credits`} aria-current={tab === "credits" ? "page" : undefined} className={tabClass}>
          크레딧된 작업 {creditedIds.length > 0 && <span className="ml-1 text-quiet">{creditedIds.length}</span>}
        </Link>
        {collaborators.length > 0 && (
          <Link href={`${base}?tab=together`} aria-current={tab === "together" ? "page" : undefined} className={tabClass}>
            함께한 사람 <span className="ml-1 text-quiet">{collaborators.length}</span>
          </Link>
        )}
        {hasCharacters && (
          <Link href={`${base}?tab=characters`} aria-current={tab === "characters" ? "page" : undefined} className={tabClass}>
            캐릭터별
          </Link>
        )}
        {collections.length > 0 && (
          <Link href={`${base}?tab=collections`} aria-current={tab === "collections" ? "page" : undefined} className={tabClass}>
            컬렉션 <span className="ml-1 text-quiet">{collections.length}</span>
          </Link>
        )}
      </nav>

      <h2 className="sr-only">{tab === "works" ? "작업물" : tab === "credits" ? "크레딧된 작업" : tab === "characters" ? "캐릭터별" : tab === "together" ? "함께한 사람" : "컬렉션"}</h2>
      {tab === "works" && shelfYears.length >= 2 && <YearShelf years={shelfYears} selected={year} hrefFor={(y) => (y === null ? base : `${base}?year=${y}`)} />}
      {/* 책장에서 한 해를 고르면 그 책이 펼쳐진다: 속표지(숫자 · 달 목차) 다음에 그해 사진 */}
      {tab === "works" && year !== null && shelf.length > 0 && (
        <YearBook
          handle={profile.handle}
          year={year}
          photos={shelf.find((y) => y.year === year)?.count ?? 0}
          events={shelf.find((y) => y.year === year)?.events ?? 0}
          partners={shelf.find((y) => y.year === year)?.partners ?? 0}
          months={book}
          selectedMonth={month}
          hrefFor={(m) => (m === null ? `${base}?year=${year}` : `${base}?year=${year}&month=${m}`)}
        />
      )}
      {tab === "together" ? (
        <div className="px-4 pt-4 md:px-6">
          {collaborators.length === 0 ? (
            <p className="py-12 text-center text-sm text-quiet">크레딧으로 함께 이름이 오른 사람이 아직 없어요.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {collaborators.map((c) => (
                <li key={c.handle}>
                  <Link prefetch={false} href={`${base}?with=${encodeURIComponent(c.handle)}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-text">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{c.displayName}</span>
                      <span className="block text-xs text-quiet">@{c.handle}</span>
                    </span>
                    <span className="text-sm text-quiet tabular-nums">함께한 기록 {c.posts} ›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : tab === "characters" ? (
        <div className="px-4 pt-4 md:px-6">
          {characters.length === 0 ? (
            <p className="py-12 text-center text-sm text-quiet">캐릭터 태그가 붙은 사진이 아직 없어요.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {characters.map((c) => (
                <li key={c.slug}>
                  <Link
                    prefetch={false}
                    href={`/t/${encodeURIComponent(c.slug)}`}
                    aria-label={`${c.name} · 사진 ${c.posts}개`}
                    className="flex flex-col gap-1.5"
                  >
                    <span className="block aspect-[4/5] overflow-hidden rounded-xl bg-slot [&_picture]:h-full">
                      {c.cover?.cover && !c.cover.cover.veil && (
                        <ProtectedPhoto
                          sources={c.cover.cover.sources}
                          alt=""
                          width={c.cover.cover.width}
                          height={c.cover.cover.height}
                          sizes="(min-width: 1024px) 160px, 33vw"
                          className="block size-full object-cover"
                        />
                      )}
                    </span>
                    <span className="truncate text-sm font-medium">{c.name}</span>
                    <span className="-mt-1 text-xs text-quiet tabular-nums">{c.posts}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : tab === "collections" ? (
        <div className="pt-4">
          <CollectionCards items={collections} empty={isMe ? "아직 만든 컬렉션이 없어요. 마이페이지 › 저장 · 컬렉션에서 만들 수 있어요." : "공개한 컬렉션이 아직 없어요."} />
        </div>
      ) : (
      <FeedList
        key={JSON.stringify(scope)}
        scope={scope}
        initial={first}
        lead={tab === "works" && year === null ? pinned : []}
        empty={
          tab === "credits"
            ? "크레딧된 작업이 아직 없어요."
            : year
              ? `${year}년에 올린 사진이 없어요.`
              : "아직 올린 사진이 없어요."
        }
      />
      )}
      </>
      )}
    </div>
  );
}

/** 캐릭터 태그가 붙은 글이 하나라도 있는지 (탭을 보일지) */
async function authorHasCharacters(authorId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("id, post_tags!inner(tag:tags!inner(kind))")
    .eq("author_id", authorId)
    .eq("status", "published")
    .eq("post_tags.tag.kind", "character")
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * 캐릭터별: 이 회원이 올린 글에 붙은 캐릭터 태그를 많이 담은 순으로.
 * 태그마다 가장 최근 사진 한 장을 표지로 쓴다. 볼 수 있는 글만 (RLS).
 */
async function authorCharacters(authorId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("posts")
    .select("id, published_at, post_tags!inner(tag:tags!inner(id, slug, name, kind))")
    .eq("author_id", authorId)
    .eq("status", "published")
    .eq("post_tags.tag.kind", "character")
    .order("published_at", { ascending: false })
    .limit(2000);

  // 태그마다 글 수와 가장 최근 글 (위에서 최신순으로 받았으므로 처음 만난 글이 가장 최근)
  const byTag = new Map<string, { slug: string; name: string; posts: number; latest: string }>();
  for (const row of data ?? []) {
    for (const { tag } of row.post_tags) {
      const found = byTag.get(tag.id);
      if (found) found.posts += 1;
      else byTag.set(tag.id, { slug: tag.slug, name: tag.name, posts: 1, latest: row.id });
    }
  }
  const ranked = [...byTag.values()].sort((a, b) => b.posts - a.posts || a.name.localeCompare(b.name, "ko")).slice(0, 60);
  const covers = new Map((await loadFeedByIds(ranked.map((c) => c.latest))).map((p) => [p.id, p]));
  return ranked.map((c) => ({ ...c, cover: covers.get(c.latest) ?? null }));
}

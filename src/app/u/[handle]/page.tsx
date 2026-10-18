import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlockButton } from "@/components/block-button";
import { CollectionCards } from "@/components/collection-cards";
import { ShareButton } from "@/components/share-button";
import { FollowButton } from "@/components/follow-button";
import { FeedList } from "@/components/feed-list";
import { ProtectedPhoto } from "@/components/protected-photo";
import { YearShelf } from "@/components/year-shelf";
import { getViewer } from "@/lib/auth/viewer";
import { loadCollectionCards } from "@/lib/collections/load";
import { getFollowedMembers } from "@/lib/follows/follows";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-input";
import { loadFeedByIds } from "@/lib/posts/feed";
import type { FeedScope } from "@/lib/posts/feed-scope";
import { creditedPostIds, loadScopePage } from "@/lib/posts/feed-scope-server";
import { loadCollaborators } from "@/lib/profiles/collaborators";
import { getProfileByHandle } from "@/lib/profiles/get-profile";
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
  // 탭: 작업물(직접 올린 글) · 크레딧된 작업(남이 올렸고 내가 승인한 글) (S-09 ⑤)
  const tab = query.tab === "credits" ? "credits" : query.tab === "collections" ? "collections" : "works";
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
  const collaborators = await loadCollaborators(profile.id, profile.handle, creditedIds).catch(() => []);
  // 커버 · 고정 글 (볼 수 있는 것만)
  const featuredIds = [...new Set([...(profile.cover_post_id ? [profile.cover_post_id] : []), ...profile.pinned_post_ids])];
  const featured = await loadFeedByIds(featuredIds);
  const cover = featured.find((f) => f.id === profile.cover_post_id)?.cover ?? null;
  const pinned = profile.pinned_post_ids.flatMap((id) => featured.filter((f) => f.id === id));
  // 작업물: 고정 글을 맨 앞에(전체 보기일 때) · 크레딧된 작업: 남이 올린 글만
  const scope: FeedScope = tab === "credits" ? { kind: "credits", memberId: profile.id } : { kind: "author", authorId: profile.id, year };
  const first = tab === "collections" ? { items: [], next: null } : await loadScopePage(scope);
  const tabClass =
    "inline-flex min-h-10 items-center border-b-2 border-transparent px-1 text-sm aria-[current=page]:border-text aria-[current=page]:font-semibold";
  // 이 회원이 사진을 올린 촬영 연도만 (S-09 ⑥)
  const years = profile.years.toSorted((a, b) => b - a);
  // 연도 책장: 해마다 표지 한 장 · 사진 · 행사 · 함께한 사람 (최근 12년까지)
  // 숫자는 DB가 한 번에 세어 준다 (author_year_counts). 표지 사진만 해마다 따로 받는다.
  const shelf =
    tab === "works"
      ? await (async () => {
          const [{ data: stats }, covers] = await Promise.all([
            supabase.rpc("author_year_counts", { author: profile.id, max_years: 12 }),
            Promise.all(
              years.slice(0, 12).map(async (y) => {
                const page = await loadScopePage({ kind: "author", authorId: profile.id, year: y });
                return [y, page.items[0] ?? null] as const;
              }),
            ),
          ]);
          const byYear = new Map((stats ?? []).map((s) => [s.shot_year, s]));
          const cover = new Map(covers);
          return years.slice(0, 12).map((y) => {
            const s = byYear.get(y);
            return {
              year: y,
              count: Number(s?.photos ?? 0),
              events: Number(s?.events ?? 0),
              partners: Number(s?.partners ?? 0),
              cover: cover.get(y) ?? null,
            };
          });
        })()
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
          <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-slot text-xl font-bold text-quiet">
            {profile.display_name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{profile.display_name}</h1>
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

        {collaborators.length > 0 && (
          <section aria-labelledby="collaborators-heading" className="flex flex-col gap-1.5">
            <h2 id="collaborators-heading" className="text-xs text-quiet">
              자주 함께한 사람
            </h2>
            <ul className="flex flex-wrap gap-1.5">
              {collaborators.map((c) => (
                <li key={c.handle}>
                  <Link
                    prefetch={false}
                    href={profileHref(c.handle)}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-line px-3 text-sm hover:border-quiet"
                  >
                    <span className="max-w-40 truncate">{c.displayName}</span>
                    <span className="text-xs text-quiet tabular-nums">{c.posts}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {isMe ? (
          <div className="flex flex-wrap gap-2">
            <Link href="/me" className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm hover:border-quiet">
              프로필 편집
            </Link>
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

      <nav aria-label="프로필 탭" className="flex gap-6 border-b border-line px-4 md:px-6">
        <Link href={base} aria-current={tab === "works" ? "page" : undefined} className={tabClass}>
          작업물
        </Link>
        <Link href={`${base}?tab=credits`} aria-current={tab === "credits" ? "page" : undefined} className={tabClass}>
          크레딧된 작업 {creditedIds.length > 0 && <span className="ml-1 text-quiet">{creditedIds.length}</span>}
        </Link>
        <Link href={`${base}?tab=collections`} aria-current={tab === "collections" ? "page" : undefined} className={tabClass}>
          컬렉션 {collections.length > 0 && <span className="ml-1 text-quiet">{collections.length}</span>}
        </Link>
      </nav>

      <h2 className="sr-only">{tab === "works" ? "작업물" : tab === "credits" ? "크레딧된 작업" : "컬렉션"}</h2>
      {tab === "works" && <YearShelf years={shelf.filter((y) => y.count > 0)} selected={year} hrefFor={(y) => (y === null ? base : `${base}?year=${y}`)} />}
      {tab === "collections" ? (
        <div className="pt-4">
          <CollectionCards items={collections} empty={isMe ? "아직 만든 컬렉션이 없어요. 마이 › 내 컬렉션에서 만들 수 있어요." : "공개한 컬렉션이 아직 없어요."} />
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
    </div>
  );
}

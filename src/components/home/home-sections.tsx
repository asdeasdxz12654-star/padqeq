import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { BOARD_LABEL, type BoardKind } from "@/lib/boards/labels";
import { formatRange } from "@/lib/events/calendar";
import { CATEGORY_LABEL } from "@/lib/photos/categories";
import type { FeedItem } from "@/lib/posts/feed";
import type { EventShelf, Exhibition, SeasonShelf, Shelf, TagTile } from "@/lib/posts/home-sections";
import { SEASON_LABEL } from "@/lib/posts/season";
import { profileHref } from "@/lib/profiles/profile-href";
import { ProtectedPhoto } from "../protected-photo";
import { Veil } from "../veil";
import { PhotoCard } from "./photo-card";

// 홈 주제별 섹션 (디자인 개편 v2 · 캔버스 1번 장). 섹션마다 제목 · 한 줄 설명 · 전체 보기.

const SHELF_SUB: Record<Shelf["category"], [string, string]> = {
  cosplay: ["이번 주 많이 본 코스프레", "새로 담긴 코스프레"],
  model: ["많이 본 인물 사진", "새로 담긴 인물 사진"],
  landscape: ["많이 본 풍경", "새로 담긴 풍경"],
  travel: ["많이 본 여행 사진", "새로 담긴 여행 사진"],
  other: ["많이 본 사진", "새로 담긴 사진"],
};

function SectionHead({ id, title, sub, href, linkLabel = "전체 보기" }: { id: string; title: string; sub?: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end gap-3 px-4 md:mb-4 md:px-6">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-bold md:text-xl">
          {title}
        </h2>
        {sub && <p className="text-sm text-quiet">{sub}</p>}
      </div>
      {href && (
        <Link
          prefetch={false}
          href={href}
          className="ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-line px-3.5 text-sm hover:border-quiet"
        >
          {linkLabel}
          <span aria-hidden="true">›</span>
        </Link>
      )}
    </div>
  );
}

/** 휴대폰은 옆으로 넘기기, PC는 한 줄 4~5장 */
function CardRow({ items }: { items: FeedItem[] }) {
  return (
    <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-6 lg:grid-cols-5">
      {items.map((post, i) => (
        <li key={post.id} className={`w-40 shrink-0 snap-start md:w-auto ${i >= 5 ? "md:hidden" : i === 4 ? "md:hidden lg:block" : ""}`}>
          <PhotoCard post={post} sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 160px" />
        </li>
      ))}
    </ul>
  );
}

/** 오늘의 픽 (회원) · 첫 화면 소개 (로그인 전) */
export function HomeHero({ pick, member }: { pick: FeedItem | null; member: boolean }) {
  if (!pick && member) return null;
  return (
    <section aria-labelledby="hero-heading" className="px-4 pt-4 md:px-6 md:pt-6">
      <div className="grid overflow-hidden rounded-2xl border border-line md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:items-center md:gap-8 md:p-4">
        {pick?.cover && (
          <div className="relative aspect-[4/3] overflow-hidden bg-slot md:rounded-xl [&_picture]:h-full">
            <Veil postId={pick.id} reason={pick.cover.veil} fill>
              <ProtectedPhoto
                sources={pick.cover.sources}
                alt={pick.cover.alt}
                width={pick.cover.width}
                height={pick.cover.height}
                sizes="(min-width: 768px) 60vw, 100vw"
                priority
                className="block size-full object-cover"
              />
            </Veil>
          </div>
        )}
        <div className="flex flex-col gap-3 px-5 py-6 md:px-2 md:py-0">
          {member && pick ? (
            <>
              <p className="text-sm font-bold text-accent">오늘의 픽</p>
              <h2 id="hero-heading" className="text-2xl leading-snug font-bold md:text-3xl">
                {pick.title}
              </h2>
              <p className="text-sm text-quiet">
                <Link prefetch={false} href={profileHref(pick.handle)} className="font-bold text-text hover:underline">
                  @{pick.handle}
                </Link>
                {` · ${CATEGORY_LABEL[pick.category]} · ${pick.shotYear}`}
                {pick.photoCount > 1 && ` · ${pick.photoCount}장`}
              </p>
              <Link
                prefetch={false}
                href={`/p/${pick.id}`}
                className="mt-1 inline-flex min-h-11 items-center self-start rounded-full bg-text px-5 text-sm font-bold text-bg"
              >
                사진 보기
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-accent">해담 — 해마다 담다</p>
              <h2 id="hero-heading" className="text-3xl leading-tight font-bold md:text-4xl">
                해마다, 잊지 않도록
              </h2>
              <p className="text-base leading-relaxed text-quiet">
                코스프레 · 인물 · 풍경 · 여행 사진을 고화질로 걸어 두고, 해마다 다시 꺼내 보는 추억 갤러리. 내려받기 버튼이 없고, AI 학습을 거부해요.
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <a href="#sections" className="inline-flex min-h-11 items-center rounded-full bg-text px-5 text-sm font-bold text-bg">
                  사진 둘러보기
                </a>
                <Link prefetch={false} href="/login" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold">
                  가입하고 올리기
                </Link>
              </div>
              {pick && (
                <p className="text-xs text-quiet">
                  사진: @{pick.handle} · {pick.title}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export function ShelfSection({ shelf }: { shelf: Shelf }) {
  const id = `shelf-${shelf.category}`;
  return (
    <section aria-labelledby={id}>
      <SectionHead
        id={id}
        title={CATEGORY_LABEL[shelf.category]}
        sub={SHELF_SUB[shelf.category][shelf.popular ? 0 : 1]}
        href={`/explore?category=${shelf.category}${shelf.popular ? "&sort=popular" : ""}`}
      />
      <CardRow items={shelf.items} />
    </section>
  );
}

/** 이 계절: 해마다 이맘때 계절에 찍은 사진 */
export function SeasonSection({ shelf }: { shelf: SeasonShelf | null }) {
  if (!shelf) return null;
  return (
    <section aria-labelledby="season-photos">
      <SectionHead id="season-photos" title={`${SEASON_LABEL[shelf.season]}에 찍은 사진`} sub={`해마다 ${SEASON_LABEL[shelf.season]}에 담긴 사진`} />
      <CardRow items={shelf.items} />
    </section>
  );
}

export function PicksRow({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="more-picks">
      <SectionHead id="more-picks" title="오늘의 픽" sub="운영자가 고른 오늘의 사진" />
      <CardRow items={items} />
    </section>
  );
}

/** 전시: 운영자가 고른 컬렉션 한 곳을 전시실처럼 (큰 한 장 + 작은 넷 · 제목 · 소개 · 모은 사람) */
export function ExhibitionSection({ shows }: { shows: Exhibition[] }) {
  if (shows.length === 0) return null;
  return (
    <section aria-labelledby="exhibitions" className="flex flex-col gap-8">
      {shows.map((show, n) => (
        <div key={show.id}>
          <SectionHead id={n === 0 ? "exhibitions" : `exhibition-${show.id}`} title={n === 0 ? "전시" : show.title} />
          <Link prefetch={false} href={`/c/${show.id}`} className="mx-4 block overflow-hidden rounded-2xl border border-line hover:border-quiet md:mx-6">
            <div className="grid gap-0.5 bg-slot md:grid-cols-[3fr_2fr]">
              <div className="aspect-[4/3] overflow-hidden [&_picture]:h-full md:aspect-auto md:h-[28rem]">
                {show.items[0]?.cover && (
                  <Veil postId={show.items[0].id} reason={show.items[0].cover.veil} fill>
                    <ProtectedPhoto
                      sources={show.items[0].cover.sources}
                      alt={show.items[0].cover.alt}
                      width={show.items[0].cover.width}
                      height={show.items[0].cover.height}
                      sizes="(min-width: 768px) 60vw, 100vw"
                      className="block size-full object-cover"
                    />
                  </Veil>
                )}
              </div>
              <div className="hidden grid-cols-2 grid-rows-2 gap-0.5 md:grid">
                {show.items.slice(1, 5).map((p) => (
                  <div key={p.id} className="overflow-hidden [&_picture]:h-full">
                    {p.cover && (
                      <Veil postId={p.id} reason={p.cover.veil} fill>
                        <ProtectedPhoto sources={p.cover.sources} alt={p.cover.alt} width={p.cover.width} height={p.cover.height} sizes="20vw" className="block size-full object-cover" />
                      </Veil>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1 px-5 py-4">
              {n === 0 && <p className="text-xl font-bold">{show.title}</p>}
              {show.note && <p className="text-sm leading-relaxed">{show.note}</p>}
              <p className="text-xs text-quiet">@{show.handle}님이 모은 사진 · 전시 보러 가기 ›</p>
            </div>
          </Link>
        </div>
      ))}
    </section>
  );
}

export function EventSection({ events }: { events: EventShelf[] }) {
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="event-photos">
      <SectionHead id="event-photos" title="행사 사진" sub="최근 행사에서 찍은 사진을 행사별로" href="/events" linkLabel="행사 캘린더" />
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-6">
        {events.map((e) => (
          <li key={e.id} className="w-72 shrink-0 snap-start md:w-auto">
            <Link prefetch={false} href={`/events/${e.id}`} className="block overflow-hidden rounded-xl border border-line hover:border-quiet">
              <div className="grid h-48 grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 bg-slot md:h-56">
                {e.items.map((p, i) =>
                  p.cover ? (
                    <div key={p.id} className={`overflow-hidden [&_picture]:h-full ${i === 0 ? "row-span-2" : ""} ${e.items.length === 1 ? "col-span-2" : ""}`}>
                      <Veil postId={p.id} reason={p.cover.veil} fill>
                        <ProtectedPhoto
                          sources={p.cover.sources}
                          alt={p.cover.alt}
                          width={p.cover.width}
                          height={p.cover.height}
                          sizes={i === 0 ? "320px" : "160px"}
                          className="block size-full object-cover"
                        />
                      </Veil>
                    </div>
                  ) : null,
                )}
              </div>
              <div className="px-4 py-3">
                <p className="font-bold">{e.name}</p>
                <p className="truncate text-sm text-quiet">
                  {formatRange(e.startsOn, e.endsOn)} · {e.venue}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function TagSection({ tags }: { tags: TagTile[] }) {
  if (tags.length === 0) return null;
  return (
    <section aria-labelledby="hot-tags">
      <SectionHead id="hot-tags" title="많이 찍는 작품" sub="요즘 사진이 많이 올라오는 작품" href="/explore" linkLabel="탐색" />
      <ul className="grid grid-cols-3 gap-2 px-4 md:grid-cols-6 md:gap-3 md:px-6">
        {tags.map((t) => (
          <li key={t.slug}>
            <Link prefetch={false} href={`/t/${encodeURIComponent(t.slug)}`} className="relative block aspect-square overflow-hidden rounded-xl bg-slot">
              {t.cover?.cover && !t.cover.cover.veil && (
                <div className="absolute inset-0 [&_picture]:h-full">
                  <ProtectedPhoto
                    sources={t.cover.cover.sources}
                    alt=""
                    width={t.cover.cover.width}
                    height={t.cover.cover.height}
                    sizes="200px"
                    className="block size-full object-cover"
                  />
                </div>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2.5 py-2 text-white">
                <span className="block truncate text-sm font-bold">{t.name}</span>
                <span className="block text-[11px] opacity-90">사진 {t.total}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LatestSection({ items, member }: { items: FeedItem[]; member: boolean }) {
  return (
    <section aria-labelledby="latest-photos">
      <SectionHead id="latest-photos" title="새로 담긴 사진" sub="방금 걸린 사진부터" />
      {items.length === 0 ? (
        <EmptyState text="아직 담긴 사진이 없어요. 첫 사진을 걸어 주세요." action={member ? { href: "/upload", label: "사진 올리기" } : { href: "/login", label: "가입하고 올리기" }} />
      ) : (
        <ul className="grid grid-cols-2 gap-x-3 gap-y-5 px-4 md:grid-cols-4 md:gap-4 md:px-6 lg:grid-cols-5">
          {items.map((post) => (
            <li key={post.id}>
              <PhotoCard post={post} sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw" />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap gap-2 px-4 md:px-6">
        <Link prefetch={false} href="/?feed=latest" className="inline-flex min-h-11 items-center rounded-full bg-text px-5 text-sm font-bold text-bg">
          최신 사진 전체
        </Link>
        {member && (
          <Link prefetch={false} href="/?feed=following" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold">
            팔로우
          </Link>
        )}
        <Link prefetch={false} href="/map" className="inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-bold">
          촬영 장소 지도
        </Link>
      </div>
    </section>
  );
}

/** 커뮤니티 새 글 (홈에서 바로 보이게) */
export function CommunitySection({ posts }: { posts: { id: string; board: BoardKind; title: string; replies: number }[] }) {
  return (
    <section aria-labelledby="community-new">
      <SectionHead id="community-new" title="커뮤니티 새 글" sub="구인 · 섭외 · 촬영 장소 · 질문" href="/community" linkLabel="커뮤니티" />
      {posts.length === 0 ? (
        <p className="px-4 text-sm text-quiet md:px-6">
          아직 글이 없어요.{" "}
          <Link prefetch={false} href="/community/write" className="font-semibold text-text underline underline-offset-4">
            첫 글 쓰기
          </Link>
        </p>
      ) : (
        <ul className="mx-4 divide-y divide-line rounded-xl border border-line md:mx-6 md:grid md:grid-cols-2 md:divide-y-0">
          {posts.map((p) => (
            <li key={p.id}>
              <Link prefetch={false} href={`/community/${p.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface">
                <span className="shrink-0 text-xs text-quiet">{BOARD_LABEL[p.board].title}</span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                {p.replies > 0 && <span className="shrink-0 text-xs text-quiet tabular-nums">답글 {p.replies}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

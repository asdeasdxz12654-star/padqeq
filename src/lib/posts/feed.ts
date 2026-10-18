import "server-only";
import { getViewer } from "@/lib/auth/viewer";
import { photoSources, type PhotoSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";
import { type Category, escapeLike, rankPosts, type SearchQuery } from "./feed-params";
import { type VeilReason, veilFor } from "./veil";

/** 한 번에 불러오는 게시물 수 (더 보기 한 번) */
export const FEED_LIMIT = 40;
/** 글 id 목록으로 불러올 때 · 인기순 후보의 최대 수 */
const MAX_IDS = 200;

export type FeedFilter = {
  year: number | null;
  /** 촬영 달 (1~12). year와 함께 쓴다 — 한 해를 펼쳐 그 달만 볼 때 */
  month?: number | null;
  category: Category | null;
  query: SearchQuery | null;
  /** 이 태그 중 하나라도 붙은 글 (태그 허브 · 행사 · 연관 게시물) */
  tagIds?: string[];
  /** 이 회원이 올린 글 (프로필) */
  authorId?: string;
  /** 이 글들만 (프로필 크레딧된 작업) */
  postIds?: string[];
  /** 팔로우 피드: 이 태그가 붙었거나 이 회원이 올린 글 */
  following?: { tagIds: string[]; authorIds: string[] };
  /** 이 순서대로 (인기순). 이 글들 중 다른 조건에 맞는 것만, 순서를 지켜 돌려준다. */
  rankedIds?: string[];
  /** 몇 개까지 (기본 · 최대 FEED_LIMIT) */
  limit?: number;
  /** 이어서 불러올 위치 (앞 페이지가 돌려준 next) */
  cursor?: string | null;
};

export type FeedItem = {
  id: string;
  title: string;
  category: Category;
  shotYear: number;
  handle: string;
  /** 볼 수 있는 사진 장수 (2장 이상이면 타일에 표시) */
  photoCount: number;
  cover: {
    width: number;
    height: number;
    alt: string;
    isPanorama: boolean;
    /** 대표 색 (사진이 뜨기 전 자리 색). 예전 사진은 null */
    color: string | null;
    sources: PhotoSources;
    /** 가림 표시 (보는 사람이 '바로 보기'를 켰으면 null) */
    veil: VeilReason | null;
  } | null;
};

export type FeedPage = { items: FeedItem[]; next: string | null };

// 게시물 + 대표 사진 1장 + 볼 수 있는 사진 수. 태그로 거를 때는 post_tags를 함께 조인한다 (볼 수 있는 연결만, RLS).
const SELECT =
  "id, title, category, shot_year, published_at, veil, author:profiles!posts_author_id_fkey(handle), photos(storage_key, width, height, alt_text, is_panorama, position, color), photo_count:photos(count)";
const TAGGED_SELECT =
  "id, title, category, shot_year, published_at, veil, author:profiles!posts_author_id_fkey(handle), photos(storage_key, width, height, alt_text, is_panorama, position, color), photo_count:photos(count), post_tags!inner(tag_id)";

type Row = {
  id: string;
  title: string;
  category: Category;
  shot_year: number;
  published_at: string | null;
  veil: VeilReason | null;
  author: { handle: string } | null;
  photos: { storage_key: string; width: number; height: number; alt_text: string; is_panorama: boolean | null; position: number; color: string | null }[];
  photo_count: { count: number }[];
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

// 이어 불러오기 위치: 시간순은 마지막 글의 게시 시각(t:), 인기순은 순위 위치(o:)
const timeCursor = (iso: string) => `t:${iso}`;
const offsetCursor = (n: number) => `o:${n}`;
function parseCursor(cursor: string | null | undefined): { before: string | null; offset: number } {
  if (cursor?.startsWith("t:") && !Number.isNaN(Date.parse(cursor.slice(2)))) return { before: new Date(cursor.slice(2)).toISOString(), offset: 0 };
  if (cursor?.startsWith("o:") && /^\d{1,4}$/.test(cursor.slice(2))) return { before: null, offset: Number(cursor.slice(2)) };
  return { before: null, offset: 0 };
}

/** 게시된 글 목록 (홈 · 탐색 · 태그 · 프로필). */
export async function loadFeed(filter: FeedFilter): Promise<FeedItem[]> {
  return (await loadFeedPage(filter)).items;
}

/** 게시된 글 한 페이지와 다음 페이지 위치. 대표 사진에는 이미지 게이트 서명 주소를 붙인다. */
export async function loadFeedPage(filter: FeedFilter): Promise<FeedPage> {
  const supabase = await createClient();
  const limit = Math.min(Math.max(filter.limit ?? FEED_LIMIT, 1), FEED_LIMIT);
  const { before, offset } = parseCursor(filter.cursor);
  const hidden = await reportedByMe(supabase);
  const authorIds = await authorsForQuery(supabase, filter.query);
  if (authorIds && !authorIds.length) return { items: [], next: null };

  const run = (extra: { tagIds?: string[]; authorIds?: string[] }, max: number) =>
    feedQuery(supabase, { ...filter, ...extra }, { before, hidden, queryAuthorIds: authorIds, max });

  // 인기순: 조건에 맞는 후보를 모두 받아 순위대로 자른다 (서명은 보여 줄 것만)
  if (filter.rankedIds) {
    if (!filter.rankedIds.length) return { items: [], next: null };
    const ranked = rankPosts(await run({}, MAX_IDS), filter.rankedIds);
    const page = ranked.slice(offset, offset + limit);
    return { items: await toItems(page), next: offset + limit < ranked.length ? offsetCursor(offset + limit) : null };
  }

  let rows: Row[];
  if (filter.following) {
    // 팔로우: 팔로우한 회원의 글 + 팔로우한 태그가 붙은 글. 둘 다 시간순이라 합쳐서 앞에서부터 자른다.
    const { tagIds, authorIds: followed } = filter.following;
    if (!tagIds.length && !followed.length) return { items: [], next: null };
    const [byAuthor, byTag] = await Promise.all([
      followed.length ? run({ authorIds: followed.slice(0, 1000) }, limit + 1) : Promise.resolve([]),
      tagIds.length ? run({ tagIds }, limit + 1) : Promise.resolve([]),
    ]);
    rows = [...new Map([...byAuthor, ...byTag].map((r) => [r.id, r])).values()].sort(
      (a, b) => Date.parse(b.published_at ?? "") - Date.parse(a.published_at ?? ""),
    );
  } else {
    rows = await run({}, limit + 1);
  }

  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return { items: await toItems(page), next: rows.length > limit && last?.published_at ? timeCursor(last.published_at) : null };
}

/** 글 id 목록을 그 순서대로 (저장 · 컬렉션 · 오늘의 픽 · 추억 등). 볼 수 있는 게시된 글만, 최대 200개. */
export async function loadFeedByIds(ids: string[]): Promise<FeedItem[]> {
  const unique = [...new Set(ids)].slice(0, MAX_IDS);
  if (!unique.length) return [];
  const supabase = await createClient();
  const rows = await feedQuery(
    supabase,
    { year: null, category: null, query: null, postIds: unique },
    { before: null, hidden: await reportedByMe(supabase), queryAuthorIds: null, max: MAX_IDS },
  );
  return toItems(rankPosts(rows, unique));
}

/** 회원마다 최근 글 몇 개 (크리에이터 목록 대표 사진). 한 번에 읽어 핸들별로 나눈다. */
export async function loadRecentByAuthors(authorIds: string[], perAuthor: number): Promise<Map<string, FeedItem[]>> {
  const ids = [...new Set(authorIds)].slice(0, 50);
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const rows = await feedQuery(
    supabase,
    { year: null, category: null, query: null, authorIds: ids },
    { before: null, hidden: await reportedByMe(supabase), queryAuthorIds: null, max: Math.min(ids.length * perAuthor * 4, 200) },
  );
  const picked = [...Map.groupBy(rows, (r) => r.author?.handle ?? "").values()].flatMap((list) => list.slice(0, perAuthor));
  return Map.groupBy(await toItems(picked), (item) => item.handle);
}

async function feedQuery(
  supabase: Supabase,
  f: FeedFilter & { authorIds?: string[] },
  o: { before: string | null; hidden: string[]; queryAuthorIds: string[] | null; max: number },
): Promise<Row[]> {
  if (f.tagIds && !f.tagIds.length) return [];
  if (f.postIds && !f.postIds.length) return [];
  let q = supabase
    .from("posts")
    .select(f.tagIds ? TAGGED_SELECT : SELECT)
    .eq("status", "published")
    // 신고로 임시 비공개된 글은 작성자 · 운영자에게도 피드에서는 뺀다 (상세에서만 안내)
    .is("held_at", null)
    .order("published_at", { ascending: false })
    .order("position", { referencedTable: "photos" })
    .limit(1, { referencedTable: "photos" })
    .limit(o.max);
  if (f.tagIds) q = q.in("post_tags.tag_id", f.tagIds.slice(0, 1000));
  if (f.year !== null) q = q.eq("shot_year", f.year);
  if (f.year !== null && f.month) {
    // 그해 그 달에 찍은 글 (촬영 날짜를 적지 않은 글은 빠진다)
    const from = `${f.year}-${String(f.month).padStart(2, "0")}-01`;
    const to = f.month === 12 ? `${f.year + 1}-01-01` : `${f.year}-${String(f.month + 1).padStart(2, "0")}-01`;
    q = q.gte("shot_on", from).lt("shot_on", to);
  }
  if (f.category !== null) q = q.eq("category", f.category);
  if (f.authorId) q = q.eq("author_id", f.authorId);
  if (f.authorIds) q = q.in("author_id", f.authorIds);
  if (f.postIds) q = q.in("id", f.postIds.slice(0, MAX_IDS));
  if (f.rankedIds) q = q.in("id", f.rankedIds.slice(0, MAX_IDS));
  if (o.before) q = q.lt("published_at", o.before);
  // 내가 신고한 글은 내 피드에서 바로 숨긴다 (S-15 ⑧). 값은 DB에서 읽은 uuid라 필터 문법을 깨뜨릴 수 없다.
  if (o.hidden.length) q = q.not("id", "in", `(${o.hidden.join(",")})`);
  // 값은 PostgREST가 인코딩한다. LIKE 특수 문자만 글자 그대로 찾도록 막는다.
  if (f.query?.kind === "title") q = q.ilike("title", `%${escapeLike(f.query.text)}%`);
  if (o.queryAuthorIds) q = q.in("author_id", o.queryAuthorIds);

  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as Row[];
}

/** 내가 신고하고 아직 처리되지 않은 글 */
async function reportedByMe(supabase: Supabase): Promise<string[]> {
  const viewer = await getViewer();
  if (!viewer) return [];
  const { data } = await supabase.from("reports").select("post_id").eq("reporter_id", viewer.id).eq("status", "open").limit(200);
  return (data ?? []).map((r) => r.post_id);
}

/** "@핸들" 검색: 핸들이 이렇게 시작하는 회원 (없으면 빈 배열, 핸들 검색이 아니면 null) */
async function authorsForQuery(supabase: Supabase, query: SearchQuery | null): Promise<string[] | null> {
  if (query?.kind !== "handle") return null;
  const { data, error } = await supabase.from("profiles").select("id").ilike("handle", `${escapeLike(query.text)}%`).limit(20);
  if (error) throw error;
  return data.map((a) => a.id);
}

// RLS로 읽어 온(볼 수 있는) 사진에만 서명 주소를 붙인다
async function toItems(rows: Row[]): Promise<FeedItem[]> {
  const viewer = await getViewer();
  const showVeiled = Boolean(viewer?.showVeiled);
  return Promise.all(
    rows.map(async (post): Promise<FeedItem> => {
      const photo = post.photos[0];
      const sources = photo ? await photoSources(photo) : null;
      return {
        id: post.id,
        title: post.title,
        category: post.category,
        shotYear: post.shot_year,
        handle: post.author?.handle ?? "",
        photoCount: post.photo_count[0]?.count ?? (photo ? 1 : 0),
        cover:
          photo && sources
            ? {
                width: photo.width,
                height: photo.height,
                alt: photo.alt_text || post.title,
                isPanorama: Boolean(photo.is_panorama),
                color: photo.color,
                sources,
                // 내 글은 가리지 않는다
                veil: veilFor(post.veil, showVeiled || (Boolean(viewer?.profile) && post.author?.handle === viewer?.profile?.handle)),
              }
            : null,
      };
    }),
  );
}

import "server-only";
import { getViewer } from "@/lib/auth/viewer";
import { photoSources, type PhotoSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";
import { type Category, escapeLike, type SearchQuery } from "./feed-params";

export const FEED_LIMIT = 40;

export type FeedFilter = {
  year: number | null;
  category: Category | null;
  query: SearchQuery | null;
  /** 이 태그 중 하나라도 붙은 글 (태그 허브) */
  tagIds?: string[];
  /** 이 회원이 올린 글 (프로필) */
  authorId?: string;
  /** 이 글들만 (프로필 크레딧된 작업) */
  postIds?: string[];
};

export type FeedItem = {
  id: string;
  title: string;
  category: Category;
  shotYear: number;
  handle: string;
  cover: {
    width: number;
    height: number;
    alt: string;
    isPanorama: boolean;
    sources: PhotoSources;
  } | null;
};

/** 게시된 글 목록 (홈 · 탐색). 대표 사진에는 이미지 게이트 서명 주소를 붙인다. */
export async function loadFeed({ year, category, query, tagIds, authorId, postIds }: FeedFilter): Promise<FeedItem[]> {
  const supabase = await createClient();

  // 태그로 좁힐 때는 먼저 글 id를 모은다 (볼 수 있는 연결만, RLS)
  let taggedPostIds: string[] | null = null;
  if (tagIds) {
    if (!tagIds.length) return [];
    const { data, error } = await supabase.from("post_tags").select("post_id").in("tag_id", tagIds).limit(200);
    if (error) throw error;
    taggedPostIds = [...new Set(data.map((r) => r.post_id))];
    if (!taggedPostIds.length) return [];
  }

  let feed = supabase
    .from("posts")
    .select(
      "id, title, category, shot_year, author:profiles!posts_author_id_fkey(handle), photos(storage_key, width, height, alt_text, is_panorama, position)",
    )
    .eq("status", "published")
    // 신고로 임시 비공개된 글은 작성자 · 운영자에게도 피드에서는 뺀다 (상세에서만 안내)
    .is("held_at", null)
    .order("published_at", { ascending: false })
    .order("position", { referencedTable: "photos" })
    .limit(1, { referencedTable: "photos" })
    .limit(FEED_LIMIT);
  if (year !== null) feed = feed.eq("shot_year", year);
  if (category !== null) feed = feed.eq("category", category);
  if (taggedPostIds) feed = feed.in("id", taggedPostIds);
  if (authorId) feed = feed.eq("author_id", authorId);
  if (postIds) {
    if (!postIds.length) return [];
    feed = feed.in("id", postIds.slice(0, 200));
  }

  // 내가 신고한 글은 내 피드에서 바로 숨긴다 (S-15 ⑧)
  const viewer = await getViewer();
  if (viewer) {
    const { data: reported } = await supabase
      .from("reports")
      .select("post_id")
      .eq("reporter_id", viewer.id)
      .eq("status", "open")
      .limit(200);
    const ids = (reported ?? []).map((r) => r.post_id);
    if (ids.length) feed = feed.not("id", "in", `(${ids.join(",")})`);
  }

  if (query?.kind === "title") {
    // 값은 PostgREST가 인코딩한다. LIKE 특수 문자만 글자 그대로 찾도록 막는다.
    feed = feed.ilike("title", `%${escapeLike(query.text)}%`);
  } else if (query?.kind === "handle") {
    const { data: authors, error } = await supabase
      .from("profiles")
      .select("id")
      .ilike("handle", `${escapeLike(query.text)}%`)
      .limit(20);
    if (error) throw error;
    if (!authors.length) return [];
    feed = feed.in(
      "author_id",
      authors.map((a) => a.id),
    );
  }

  const { data, error } = await feed;
  if (error) throw error;

  // RLS로 읽어 온(볼 수 있는) 사진에만 서명 주소를 붙인다
  return Promise.all(
    data.map(async (post): Promise<FeedItem> => {
      const photo = post.photos[0];
      const sources = photo ? await photoSources(photo) : null;
      return {
        id: post.id,
        title: post.title,
        category: post.category,
        shotYear: post.shot_year,
        handle: post.author?.handle ?? "",
        cover:
          photo && sources
            ? {
                width: photo.width,
                height: photo.height,
                alt: photo.alt_text || post.title,
                isPanorama: Boolean(photo.is_panorama),
                sources,
              }
            : null,
      };
    }),
  );
}

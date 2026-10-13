import "server-only";
import { photoSources, type PhotoSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";
import { type Category, escapeLike, type SearchQuery } from "./feed-params";

export const FEED_LIMIT = 40;

export type FeedFilter = { year: number | null; category: Category | null; query: SearchQuery | null };

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
export async function loadFeed({ year, category, query }: FeedFilter): Promise<FeedItem[]> {
  const supabase = await createClient();

  let feed = supabase
    .from("posts")
    .select(
      "id, title, category, shot_year, author:profiles!posts_author_id_fkey(handle), photos(storage_key, width, height, alt_text, is_panorama, position)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("position", { referencedTable: "photos" })
    .limit(1, { referencedTable: "photos" })
    .limit(FEED_LIMIT);
  if (year !== null) feed = feed.eq("shot_year", year);
  if (category !== null) feed = feed.eq("category", category);

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

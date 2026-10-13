import "server-only";
import { type FeedItem, loadFeed } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

export type CollectionCard = {
  id: string;
  title: string;
  isPublic: boolean;
  count: number;
  cover: FeedItem["cover"];
};

/** 회원의 컬렉션 목록 (최근 고친 순). 본인이면 비공개도, 남이면 공개만 (RLS). 표지는 가장 최근에 담은 글. */
export async function loadCollectionCards(ownerId: string): Promise<CollectionCard[]> {
  const supabase = await createClient();
  const { data: collections, error } = await supabase
    .from("collections")
    .select("id, title, is_public")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  if (!collections.length) return [];

  // 볼 수 있는 글만 (RLS)
  const { data: items } = await supabase
    .from("collection_posts")
    .select("collection_id, post_id, added_at")
    .in(
      "collection_id",
      collections.map((c) => c.id),
    )
    .order("added_at", { ascending: false })
    .limit(5000);
  const byCollection = Map.groupBy(items ?? [], (i) => i.collection_id);
  const coverIds = [...new Set(collections.flatMap((c) => byCollection.get(c.id)?.[0]?.post_id ?? []))];
  const covers = new Map(
    (coverIds.length ? await loadFeed({ year: null, category: null, query: null, postIds: coverIds }) : []).map((p) => [p.id, p.cover]),
  );

  return collections.map((c) => {
    const posts = byCollection.get(c.id) ?? [];
    return {
      id: c.id,
      title: c.title,
      isPublic: c.is_public,
      count: posts.length,
      cover: posts[0] ? (covers.get(posts[0].post_id) ?? null) : null,
    };
  });
}

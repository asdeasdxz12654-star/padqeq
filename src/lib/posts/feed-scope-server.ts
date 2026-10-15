import "server-only";
import { getViewer } from "@/lib/auth/viewer";
import { followedFeed } from "@/lib/follows/follows";
import { createClient } from "@/lib/supabase/server";
import { type FeedFilter, type FeedPage, loadFeedPage } from "./feed";
import { parseQuery, POPULAR_DAYS } from "./feed-params";
import type { FeedScope } from "./feed-scope";

const NONE: FeedFilter = { year: null, category: null, query: null };

/** 피드 종류 → 실제 조건. 화면과 '더 보기'가 같이 쓴다. 볼 수 없는 조건이면 null(빈 목록). */
export async function filterForScope(scope: FeedScope): Promise<FeedFilter | null> {
  const supabase = await createClient();
  switch (scope.kind) {
    case "home": {
      // 추천은 최근 글 중심이라, 연도를 고르면 그해 사진을 최신순으로
      if (scope.feed === "recommended" && scope.year === null) {
        const { data, error } = await supabase.rpc("recommended_posts", { max_rows: 200 });
        if (error) throw error;
        // 최근 60일에 올라온 글이 없으면(오래 쉰 뒤 등) 최신순으로
        if (data.length) return { ...NONE, rankedIds: data.map((r) => r.post_id) };
      }
      if (scope.feed !== "following") return { ...NONE, year: scope.year };
      const viewer = await getViewer();
      if (!viewer?.profile) return null;
      return { ...NONE, year: scope.year, following: await followedFeed(viewer.id) };
    }
    case "explore": {
      const filter: FeedFilter = { year: scope.year, category: scope.category, query: parseQuery(scope.q ?? undefined) };
      if (scope.sort === "latest") return filter;
      // 인기순: 최근 좋아요 순위 안에서 조건에 맞는 글
      const { data, error } = await supabase.rpc("popular_posts", { days: POPULAR_DAYS, max_rows: 200 });
      if (error) throw error;
      return { ...filter, rankedIds: data.map((r) => r.post_id) };
    }
    case "tag": {
      // 작품 허브에는 그 작품 캐릭터 사진도 함께 (볼 수 있는 태그만, RLS)
      const { data } = await supabase.from("tags").select("id").eq("parent_id", scope.tagId).limit(100);
      return { ...NONE, year: scope.year, tagIds: [scope.tagId, ...(data ?? []).map((t) => t.id)] };
    }
    case "author":
      return { ...NONE, year: scope.year, authorId: scope.authorId };
    case "credits": {
      const ids = await creditedPostIds(scope.memberId);
      return ids.length ? { ...NONE, postIds: ids } : null;
    }
  }
}

export async function loadScopePage(scope: FeedScope, cursor: string | null = null): Promise<FeedPage> {
  const filter = await filterForScope(scope);
  return filter ? loadFeedPage({ ...filter, cursor }) : { items: [], next: null };
}

/** 이 회원이 크레딧된(승인) 남의 글. 본인이 올린 글은 작업물에 있으므로 뺀다. 볼 수 있는 글만 (RLS). */
export async function creditedPostIds(memberId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credits")
    .select("post_id, post:posts!credits_post_id_fkey(author_id)")
    .eq("member_id", memberId)
    .eq("status", "approved")
    .limit(500);
  return [...new Set((data ?? []).flatMap((c) => (c.post && c.post.author_id !== memberId ? [c.post_id] : [])))].slice(0, 200);
}

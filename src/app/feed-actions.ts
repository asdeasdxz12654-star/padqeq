"use server";

import type { FeedPage } from "@/lib/posts/feed";
import { feedScopeSchema } from "@/lib/posts/feed-scope";
import { loadScopePage } from "@/lib/posts/feed-scope-server";

/** 피드 '더 보기' (S-02 ④). 조건은 서버에서 다시 검증하고, 볼 수 있는 글만 돌려준다 (RLS). */
export async function loadMoreFeed(scope: unknown, cursor: unknown): Promise<FeedPage> {
  const parsed = feedScopeSchema.safeParse(scope);
  if (!parsed.success || typeof cursor !== "string" || cursor.length > 64) return { items: [], next: null };
  return loadScopePage(parsed.data, cursor);
}

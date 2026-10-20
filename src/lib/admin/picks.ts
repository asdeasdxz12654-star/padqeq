import "server-only";
import { todayKst } from "@/lib/auth/signup-input";
import { type FeedItem, loadFeedByIds } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

// 대시보드 '오늘의 픽' 칸 (관리 시안 44): 오늘 고른 글(순서대로) · 후보 · 전시 중인 컬렉션

export type PicksPanel = {
  date: string;
  picks: FeedItem[];
  candidates: FeedItem[];
  exhibits: { id: string; title: string; owner: string }[];
};

const CANDIDATE_DAYS = 3;
const CANDIDATE_COUNT = 12;

export async function loadPicksPanel(): Promise<PicksPanel> {
  const supabase = await createClient();
  const date = todayKst();
  const since = new Date(Date.now() - CANDIDATE_DAYS * 86_400_000).toISOString();
  const [picked, recent, exhibits] = await Promise.all([
    supabase.from("daily_picks").select("post_id").eq("pick_date", date).order("position"),
    // 후보: 최근 공개 글 중 반응 많은 순 (가림 · 신고로 숨김 · 지운 글은 빼고)
    supabase
      .from("posts")
      .select("id, post_likes(count)")
      .eq("status", "published")
      .eq("visibility", "public")
      .gte("published_at", since)
      .is("held_at", null)
      .is("removed_at", null)
      .is("trashed_at", null)
      .is("veil", null)
      .order("published_at", { ascending: false })
      .limit(80),
    supabase
      .from("collections")
      .select("id, title, owner:profiles!collections_owner_id_fkey(handle)")
      .not("exhibited_at", "is", null)
      .order("exhibited_at", { ascending: false })
      .limit(10),
  ]);
  const pickedIds = (picked.data ?? []).map((r) => r.post_id);
  const taken = new Set(pickedIds);
  const candidateIds = (recent.data ?? [])
    .filter((p) => !taken.has(p.id))
    .map((p) => ({ id: p.id, likes: p.post_likes[0]?.count ?? 0 }))
    .sort((a, b) => b.likes - a.likes)
    .slice(0, CANDIDATE_COUNT)
    .map((p) => p.id);
  const [picks, candidates] = await Promise.all([loadFeedByIds(pickedIds), loadFeedByIds(candidateIds)]);
  const order = new Map(pickedIds.map((id, i) => [id, i]));
  return {
    date,
    picks: picks.toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
    candidates,
    exhibits: (exhibits.data ?? []).map((c) => ({ id: c.id, title: c.title, owner: (c.owner as { handle: string } | null)?.handle ?? "?" })),
  };
}

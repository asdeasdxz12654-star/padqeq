import "server-only";
import { type FeedItem, loadFeedByIds } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

export type ShelfYear = { year: number; count: number; events: number; partners: number; cover: FeedItem | null };

/**
 * 연도 책장 (프로필 · 마이페이지): 해마다 사진 · 행사 · 함께한 사람 수와 표지 한 장 (최근 12년까지).
 * 숫자는 DB가 한 번에 세고(author_year_counts), 표지는 해마다 가장 최근 글을 한 번에 골라 받는다
 * (예전에는 해마다 따로 불러 최대 12번 조회했다). 볼 수 있는 게시된 글만 (RLS).
 */
export async function loadYearShelf(authorId: string, years: number[]): Promise<ShelfYear[]> {
  const shown = years.toSorted((a, b) => b - a).slice(0, 12);
  if (!shown.length) return [];
  const supabase = await createClient();
  const [{ data: stats }, { data: recent }] = await Promise.all([
    supabase.rpc("author_year_counts", { author: authorId, max_years: 12 }),
    supabase
      .from("posts")
      .select("id, shot_year")
      .eq("author_id", authorId)
      .eq("status", "published")
      .is("held_at", null)
      .in("shot_year", shown)
      .order("published_at", { ascending: false })
      .limit(1000),
  ]);
  // 해마다 가장 최근 글 하나
  const firstOfYear = new Map<number, string>();
  for (const p of recent ?? []) if (!firstOfYear.has(p.shot_year)) firstOfYear.set(p.shot_year, p.id);
  const covers = new Map((await loadFeedByIds([...firstOfYear.values()])).map((item) => [item.id, item]));
  const byYear = new Map((stats ?? []).map((s) => [s.shot_year, s]));
  return shown.map((year) => {
    const s = byYear.get(year);
    const coverId = firstOfYear.get(year);
    return {
      year,
      count: Number(s?.photos ?? 0),
      events: Number(s?.events ?? 0),
      partners: Number(s?.partners ?? 0),
      cover: (coverId && covers.get(coverId)) || null,
    };
  });
}

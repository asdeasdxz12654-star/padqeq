import "server-only";
import { createClient } from "@/lib/supabase/server";
import { type FeedItem, loadFeed } from "./feed";

/** 오늘의 픽 (S-02 ③): 오늘(한국 날짜) 것이 없으면 가장 최근 날짜의 픽. 운영자가 고른 순서대로. */
export async function loadDailyPicks(): Promise<{ date: string; items: FeedItem[] } | null> {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("daily_picks")
    .select("pick_date, post_id, position")
    .lte("pick_date", today)
    .order("pick_date", { ascending: false })
    .order("position")
    .limit(30);
  if (error || !data.length) return null;
  const date = data[0]!.pick_date;
  const order = data.filter((r) => r.pick_date === date).map((r) => r.post_id);
  const feed = await loadFeed({ year: null, category: null, query: null, postIds: order });
  const byId = new Map(feed.map((item) => [item.id, item]));
  const items = order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  return items.length ? { date, items } : null;
}

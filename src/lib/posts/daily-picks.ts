import "server-only";
import { todayKst } from "@/lib/auth/signup-input";
import { createClient } from "@/lib/supabase/server";
import { type FeedItem, loadFeedByIds } from "./feed";

/** 오늘의 픽 (S-02 ③): 오늘(한국 날짜) 것이 없으면 가장 최근 날짜의 픽. 운영자가 고른 순서대로. */
export async function loadDailyPicks(): Promise<{ date: string; items: FeedItem[] } | null> {
  const today = todayKst();
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
  const items = await loadFeedByIds(order);
  return items.length ? { date, items } : null;
}

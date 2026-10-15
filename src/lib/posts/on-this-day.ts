import "server-only";
import { todayKst } from "@/lib/auth/signup-input";
import { createClient } from "@/lib/supabase/server";
import { type FeedItem, loadFeedByIds } from "./feed";

export type OnThisDayItem = FeedItem & { yearsAgo: number };

/** N년 전 이맘때 (한국 날짜 기준 앞뒤 3일). 가까운 해부터. */
export async function loadOnThisDay(now: Date = new Date()): Promise<OnThisDayItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("on_this_day", { target: todayKst(now) });
  // 홈의 덤 영역이므로 실패해도 페이지는 그대로 보여 준다
  if (error || !data.length) return [];

  const yearsAgo = new Map(data.map((r) => [r.post_id, r.years_ago]));
  const items = await loadFeedByIds([...yearsAgo.keys()]);
  return items.map((item) => ({ ...item, yearsAgo: yearsAgo.get(item.id)! }));
}

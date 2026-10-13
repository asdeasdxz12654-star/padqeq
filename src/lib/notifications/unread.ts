import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** 안 읽은 알림 수 (상단 바 표시용). 로그인하지 않았으면 0. 100개 이상은 100으로 (화면에는 99+). */
export const getUnreadCount = cache(async (userId: string | null): Promise<number> => {
  if (!userId) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  // 알림을 못 세도 페이지는 그대로 보여 준다
  return error ? 0 : Math.min(count ?? 0, 100);
});

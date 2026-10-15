import "server-only";
import { createClient } from "@/lib/supabase/server";

/** 남은 업로드 자리 정리 시간: 이보다 오래된 내 자리는 업로드 화면을 열 때 지운다 (다른 창에서 올리는 중일 수 있어 여유를 둔다) */
const STALE_SLOT_MS = 6 * 3_600_000;

/** 새로 고침 · 창 닫기로 남은 내 업로드 자리를 지운다 */
export async function discardStaleUploadSlots(): Promise<void> {
  const supabase = await createClient();
  const { data: stale } = await supabase
    .from("upload_slots")
    .select("id")
    .lt("created_at", new Date(Date.now() - STALE_SLOT_MS).toISOString())
    .limit(500);
  if (stale?.length) await supabase.rpc("discard_upload_slots", { ids: stale.map((s) => s.id) });
}

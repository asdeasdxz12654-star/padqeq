"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 화면에 보인 알림(이 번호까지)을 읽음 처리한다. 그 사이 새로 온 알림은 그대로 둔다. */
export async function markNotificationsRead(upToId: number): Promise<void> {
  const id = z.int().positive().safeParse(upToId);
  if (!id.success) return;
  const viewer = await getViewer();
  if (!viewer?.profile) return;
  const supabase = await createClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", viewer.id)
    .is("read_at", null)
    .lte("id", id.data);
  revalidatePath("/", "layout");
}

"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 'N년 전 오늘' 알림 켜기 · 끄기 (S-18 알림 · 설정) */
export async function setMemoryAlerts(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ memory_alerts: on === true }).eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings");
  return { ok: true };
}

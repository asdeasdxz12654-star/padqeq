"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 계정 삭제 요청 (30일 유예). 확인용으로 내 핸들을 정확히 입력해야 한다. */
export async function requestDeletion(confirmHandle: string): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  if (String(confirmHandle).trim().replace(/^@/, "").toLowerCase() !== viewer.profile.handle) {
    return { ok: false, error: "핸들이 맞지 않아요." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) return { ok: false, error: "요청하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelDeletion(): Promise<{ ok: boolean; error?: string }> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_account_deletion");
  if (error) return { ok: false, error: "취소하지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true };
}

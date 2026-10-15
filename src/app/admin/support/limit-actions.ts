"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { limitErrorMessage, limitSchema } from "@/lib/admin/limits";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 한도 값 바꾸기 (A-05 ③). 범위 · 감사 로그는 DB 함수가 맡는다. */
export async function setLimit(input: z.input<typeof limitSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = limitSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 바꿀 수 있어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_site_limit", { name: parsed.data.key, new_value: parsed.data.value, note: parsed.data.note });
  if (error) return { ok: false, error: limitErrorMessage(error.message) };
  revalidatePath("/admin/support");
  return { ok: true };
}

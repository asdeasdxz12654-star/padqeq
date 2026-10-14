"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { sanctionErrorMessage, sanctionSchema } from "@/lib/moderation/sanctions";
import { createClient } from "@/lib/supabase/server";

/** 회원 제재 (A-05). 권한 · 운영자 제외 · 감사 로그 · 알림은 DB 함수가 맡는다. */
export async function sanction(input: z.input<typeof sanctionSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = sanctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };

  const { memberId, action, note, days, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("sanction_member", { target: memberId, action, note, days, reason });
  if (error) return { ok: false, error: sanctionErrorMessage(error.message) };
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true };
}

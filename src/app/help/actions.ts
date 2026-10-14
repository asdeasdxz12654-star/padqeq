"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { inquiryErrorMessage, inquirySchema } from "@/lib/support/inquiry-input";

/** 1:1 문의 (S-20 ④). 열린 문의 5건 · 하루 10건은 DB가 막는다. */
export async function submitInquiry(input: z.input<typeof inquirySchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "내용을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase.from("inquiries").insert({
    author_id: viewer.id,
    category: parsed.data.category,
    body: parsed.data.body,
    error_ref: parsed.data.errorRef,
  });
  if (error) return { ok: false, error: inquiryErrorMessage(error.message) };
  revalidatePath("/help");
  revalidatePath("/admin/support");
  return { ok: true };
}

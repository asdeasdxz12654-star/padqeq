"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  postId: z.uuid(),
  decision: z.enum(["dismiss", "hold", "hide", "release", "restore"]),
  note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
});

/** 신고 처리 (A-04 ⑦ · ⑧). 권한 · 사유 필수 · 감사 로그는 DB 함수가 다시 확인한다. */
export async function moderate(input: z.input<typeof schema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_post", {
    target: parsed.data.postId,
    decision: parsed.data.decision,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/admin/reports");
  revalidatePath("/");
  return { ok: true };
}

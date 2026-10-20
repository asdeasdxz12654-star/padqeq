"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { bulkSchema } from "@/lib/admin/post-bulk";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { VEIL_REASONS } from "@/lib/posts/veil-reasons";
import { createClient } from "@/lib/supabase/server";

/** 게시물 일괄 작업 (A-03). 권한 · 상태 확인 · 감사 로그는 DB 함수가 맡는다. */
export async function bulkPosts(input: z.input<typeof bulkSchema>): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };

  const { ids, action, note } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_posts_action", { targets: ids, action, note });
  if (error) return { ok: false, error: "처리하지 못했어요. 잠시 뒤 다시 해 주세요." };
  revalidatePath("/admin/posts");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
  return { ok: true, count: data };
}

const veilSchema = z.object({
  postId: z.uuid(),
  reason: z.enum(VEIL_REASONS).nullable(),
  note: z.string().trim().min(1, "이유를 적어 주세요.").max(500, "이유는 500자까지예요."),
});

/** 가림 표시 붙이기 · 바꾸기 · 풀기 (운영자). 권한 · 알림 · 감사 로그는 DB 함수가 맡는다. */
export async function setPostVeil(input: z.input<typeof veilSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = veilSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!isStaffRole(viewer?.profile?.role)) return { ok: false, error: "운영자만 처리할 수 있어요." };

  const { postId, reason, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_post_veil", { target: postId, reason, note });
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
  revalidatePath(`/admin/posts/${postId}`);
  revalidatePath("/", "layout");
  return { ok: true };
}

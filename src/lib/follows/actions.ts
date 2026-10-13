"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ tagId: z.uuid(), follow: z.boolean() });

/** 태그 팔로우 · 끊기. 볼 수 있는 태그인지 · 300개 제한은 DB가 다시 확인한다. */
export async function setTagFollow(input: z.input<typeof schema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { tagId, follow } = parsed.data;
  const { error } = follow
    ? await supabase.from("tag_follows").upsert({ user_id: viewer.id, tag_id: tagId }, { onConflict: "user_id,tag_id", ignoreDuplicates: true })
    : await supabase.from("tag_follows").delete().eq("user_id", viewer.id).eq("tag_id", tagId);
  if (error) {
    if (error.message.includes("tag_follow_limit")) return { ok: false, error: "태그는 300개까지 팔로우할 수 있어요." };
    return { ok: false, error: follow ? "팔로우하지 못했어요." : "팔로우를 끊지 못했어요." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

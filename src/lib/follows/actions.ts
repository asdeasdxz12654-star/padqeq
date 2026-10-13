"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({ kind: z.enum(["tag", "member"]), id: z.uuid(), follow: z.boolean() });
export type FollowTarget = { kind: "tag" | "member"; id: string };

/**
 * 태그 · 회원 팔로우와 끊기. 볼 수 있는 대상인지 · 개수 제한(태그 300 · 회원 1000) · 자기 자신은 DB가 다시 확인한다.
 * 팔로우 목록은 본인만 본다 (알림 없음).
 */
export async function setFollow(input: z.input<typeof schema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { kind, id, follow } = parsed.data;
  const { error } =
    kind === "tag"
      ? follow
        ? await supabase.from("tag_follows").upsert({ user_id: viewer.id, tag_id: id }, { onConflict: "user_id,tag_id", ignoreDuplicates: true })
        : await supabase.from("tag_follows").delete().eq("user_id", viewer.id).eq("tag_id", id)
      : follow
        ? await supabase
            .from("member_follows")
            .upsert({ follower_id: viewer.id, followee_id: id }, { onConflict: "follower_id,followee_id", ignoreDuplicates: true })
        : await supabase.from("member_follows").delete().eq("follower_id", viewer.id).eq("followee_id", id);
  if (error) {
    if (error.message.includes("tag_follow_limit")) return { ok: false, error: "태그는 300개까지 팔로우할 수 있어요." };
    if (error.message.includes("member_follow_limit")) return { ok: false, error: "회원은 1000명까지 팔로우할 수 있어요." };
    return { ok: false, error: follow ? "팔로우하지 못했어요." : "팔로우를 끊지 못했어요." };
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

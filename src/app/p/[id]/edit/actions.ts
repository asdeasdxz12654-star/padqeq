"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { insertCredits } from "@/lib/photos/credit-rows";
import { diffTags, editSchema, type EditInput } from "@/lib/posts/edit-input";
import { createClient } from "@/lib/supabase/server";

/** 게시물 편집 저장. 작성자만 (RLS · 열 권한). 태그는 쓸 수 있는 태그인지 RLS가 확인한다. */
export async function updatePost(input: EditInput): Promise<{ ok: boolean; error?: string }> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { postId, title, body, category, shotYear, shotOn, tagIds, alts, credits } = parsed.data;
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("posts")
    .update({ title, body, category, shot_year: shotYear, shot_on: shotOn })
    .eq("id", postId)
    .eq("author_id", viewer.id)
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "저장하지 못했어요." };

  const { data: current } = await supabase.from("post_tags").select("tag_id").eq("post_id", postId);
  const { remove, add } = diffTags((current ?? []).map((r) => r.tag_id), tagIds);
  if (remove.length) {
    const { error: removeError } = await supabase.from("post_tags").delete().eq("post_id", postId).in("tag_id", remove);
    if (removeError) return { ok: false, error: "태그를 떼지 못했어요." };
  }
  if (add.length) {
    const { error: addError } = await supabase.from("post_tags").insert(add.map((tag_id) => ({ post_id: postId, tag_id })));
    if (addError) return { ok: false, error: "태그를 붙이지 못했어요. 태그를 다시 골라 주세요." };
  }

  // 사진 설명 (대체 텍스트)
  const results = await Promise.all(
    alts.map(({ photoId, altText }) =>
      supabase.from("photos").update({ alt_text: altText }).eq("id", photoId).eq("post_id", postId),
    ),
  );
  if (results.some((r) => r.error)) return { ok: false, error: "사진 설명을 저장하지 못했어요." };

  // 크레딧: 빠진 것은 지우고 새것을 붙인다 (회원에게는 승인 요청 알림)
  const { data: currentCredits } = await supabase.from("credits").select("id").eq("post_id", postId);
  const keep = new Set(credits.keep);
  const dropped = (currentCredits ?? []).map((c) => c.id).filter((id) => !keep.has(id));
  if (dropped.length) {
    const { error: dropError } = await supabase.from("credits").delete().eq("post_id", postId).in("id", dropped);
    if (dropError) return { ok: false, error: "크레딧을 빼지 못했어요." };
  }
  const creditResult = await insertCredits(supabase, postId, viewer.id, credits.add);
  if (!creditResult.ok) return creditResult;

  revalidatePath("/", "layout");
  return { ok: true };
}

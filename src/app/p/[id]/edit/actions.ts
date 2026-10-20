"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { insertCredits } from "@/lib/photos/credit-rows";
import { consentSchema, type ConsentInput } from "@/lib/photos/post-input";
import { diffTags, editSchema, type EditInput } from "@/lib/posts/edit-input";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * 사진에 사람이 나와요 · 촬영 동의 기록 (게시물 편집). 작성자만 (RLS: 동의 기록은 작성자 · 운영자가 남기고 운영자만 본다).
 * 새로 켜면 동의 기록이 있어야 한다. 이미 켜져 있으면 새 기록을 더할 수 있다 (지난 기록은 그대로 남는다).
 */
export async function updatePeople(input: { postId: string; hasPeople: boolean; consent: ConsentInput | null }): Promise<{ ok: boolean; error?: string }> {
  const postId = z.uuid().safeParse(input.postId);
  const consent = input.consent ? consentSchema.safeParse(input.consent) : null;
  if (!postId.success || typeof input.hasPeople !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  if (consent && !consent.success) return { ok: false, error: consent.error.issues[0]?.message ?? "동의 기록을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data: post } = await supabase.from("posts").select("id, has_people").eq("id", postId.data).eq("author_id", viewer.id).maybeSingle();
  if (!post) return { ok: false, error: "게시물을 찾을 수 없어요." };
  if (input.hasPeople && !post.has_people && !consent) return { ok: false, error: "사람이 나오는 사진은 촬영 동의 기록이 필요해요." };

  if (consent?.data) {
    const c = consent.data;
    const { error } = await supabase.from("consent_records").insert({
      post_id: post.id,
      subject_label: c.subjectLabel,
      consented_on: c.consentedOn,
      note: c.note,
      has_minor: c.hasMinor,
      guardian_consent: c.guardianConsent,
      subject_url: c.subjectUrl,
      created_by: viewer.id,
    });
    if (error) return { ok: false, error: "동의 기록을 남기지 못했어요." };
  }
  if (input.hasPeople !== post.has_people) {
    const { error } = await supabase.from("posts").update({ has_people: input.hasPeople }).eq("id", post.id).eq("author_id", viewer.id);
    if (error) return { ok: false, error: "저장하지 못했어요." };
  }
  return { ok: true };
}

/** 게시물 편집 저장. 작성자만 (RLS · 열 권한). 태그는 쓸 수 있는 태그인지 RLS가 확인한다. */
export async function updatePost(input: EditInput): Promise<{ ok: boolean; error?: string }> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { postId, title, body, category, shotYear, shotOn, tagIds, alts, credits, photoOrder, visibility, commentPolicy, scheduledAt, showExif, veil } = parsed.data;
  const supabase = await createClient();

  const { data: updated, error } = await supabase
    .from("posts")
    .update({
      title,
      body,
      category,
      shot_year: shotYear,
      shot_on: shotOn,
      visibility,
      comment_policy: commentPolicy,
      show_exif: showExif,
      ...(veil !== undefined && { veil }),
      ...(scheduledAt !== undefined && { scheduled_at: scheduledAt }),
    })
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

  // 사진 빼기 · 순서 (바뀐 경우만). 뺀 사진 파일은 7일 뒤 정리된다.
  const { data: currentPhotos } = await supabase.from("photos").select("id").eq("post_id", postId).order("position");
  if ((currentPhotos ?? []).map((p) => p.id).join() !== photoOrder.join()) {
    const { error: arrangeError } = await supabase.rpc("arrange_my_photos", { target: postId, keep: photoOrder });
    if (arrangeError) return { ok: false, error: "사진 순서를 저장하지 못했어요." };
  }

  // 사진 설명 (대체 텍스트) · 뒷면 메모 (남긴 사진만)
  const kept = new Set(photoOrder);
  const results = await Promise.all(
    alts.filter((a) => kept.has(a.photoId)).map(({ photoId, altText, backMemo }) =>
      supabase.from("photos").update({ alt_text: altText, back_memo: backMemo }).eq("id", photoId).eq("post_id", postId),
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

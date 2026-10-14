"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES } from "@/lib/moderation/evidence";
import { REPORT_REASONS } from "@/lib/moderation/reasons";
import { getPost, type ViewerPhoto } from "@/lib/posts/get-post";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

const reportSchema = z.object({
  postId: z.uuid(),
  reason: z.enum(REPORT_REASONS),
  detail: z.string().trim().max(1000).default(""),
  photoPosition: z.int().min(0).max(19).nullable(),
});

/** 신고 (S-15). 같은 글 중복 · 하루 20건 · 내 글 · 볼 수 없는 글은 DB가 막는다. */
export async function submitReport(
  input: z.input<typeof reportSchema>,
): Promise<{ ok: true; reportId: string } | { ok: false; error: string }> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "신고 내용을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { postId, reason, detail, photoPosition } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .insert({
      reporter_id: viewer.id,
      post_id: postId,
      reason,
      detail,
      photo_position: photoPosition,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 신고한 게시물이에요. 처리 결과를 기다려 주세요." };
    if (error.message.includes("report_rate_limited")) return { ok: false, error: "오늘은 더 신고할 수 없어요. 내일 다시 시도해 주세요." };
    return { ok: false, error: "신고하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
  }
  revalidatePath("/");
  return { ok: true, reportId: data.id };
}

const evidenceSchema = z.object({
  reportId: z.uuid(),
  contentType: z.enum(EVIDENCE_TYPES),
  bytes: z.int().min(1).max(MAX_EVIDENCE_BYTES),
});

/** 신고 증거 자리 만들기. 파일은 돌려준 id로 /api/reports/evidence/{id}에 올린다. 신고자 · 3장 제한은 DB가 확인한다. */
export async function startEvidence(input: z.input<typeof evidenceSchema>): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = evidenceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "JPEG · PNG · WebP 사진을 10MB까지 올릴 수 있어요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_report_evidence", {
    target: parsed.data.reportId,
    content_type: parsed.data.contentType,
    bytes: parsed.data.bytes,
  });
  const row = data?.[0];
  if (error || !row) {
    if (error?.message.includes("evidence_limit")) return { ok: false, error: "증거는 3장까지 붙일 수 있어요." };
    return { ok: false, error: "증거를 올리지 못했어요." };
  }
  return { ok: true, id: row.id };
}

/** 화면을 오래 열어 두어 서명 주소가 만료됐을 때 새 주소를 받는다 (권한은 다시 확인) */
export async function refreshPhotoSources(postId: string): Promise<ViewerPhoto[] | null> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return null;
  return (await getPost(id.data))?.photos ?? null;
}

/**
 * 게시 중단(숨김). 삭제는 30일 복구 기간을 두고 운영 화면에서 처리하므로(P-01) 여기서는 숨기기만 한다.
 * 작성자 · 운영자만 (RLS).
 */
export async function hidePost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "hidden" })
    .eq("id", id.data)
    .eq("status", "published")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "숨기지 못했어요." };

  revalidatePath("/");
  return { ok: true };
}

/** 워터마크 판정용 열쇠 (운영자만). DB 함수도 운영자가 아니면 빈 결과를 돌려준다. */
export async function getWatermarkSeeds(postId: string): Promise<{ position: number; seed: string; width: number; height: number }[] | null> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return null;
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return null;

  const supabase = await createClient();
  const [seeds, photos] = await Promise.all([
    supabase.rpc("photo_watermark_seeds", { target_post: id.data }),
    supabase.from("photos").select("id, width, height").eq("post_id", id.data),
  ]);
  if (seeds.error || photos.error) return null;
  const size = new Map(photos.data.map((p) => [p.id, p]));
  return seeds.data.flatMap((s) => {
    const p = size.get(s.photo_id);
    return p ? [{ position: s.position, seed: s.seed, width: p.width, height: p.height }] : [];
  });
}

/** 내가 태그된 크레딧 해제 (당사자 또는 작성자만 지울 수 있다, RLS) */
export async function removeMyCredit(creditId: string): Promise<{ ok: boolean; error?: string }> {
  const id = idSchema.safeParse(creditId);
  if (!id.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("credits").delete().eq("id", id.data).eq("member_id", viewer.id).select("id");
  if (error || !data?.length) return { ok: false, error: "해제하지 못했어요." };
  revalidatePath("/");
  return { ok: true };
}

const appealSchema = z.object({
  postId: z.uuid(),
  statement: z
    .string()
    .trim()
    .min(10, "10자 이상 적어 주세요.")
    .max(2000, "2000자까지 적을 수 있어요.")
    .refine((v) => !/\p{Cc}/u.test(v.replace(/\r?\n/g, "")), "쓸 수 없는 문자가 있어요."),
});

/** 소명 (이의 제기). 조치된 내 글 · 한 번에 하나 · 게시물당 3번은 DB가 다시 확인한다. */
export async function submitAppeal(input: z.input<typeof appealSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = appealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "내용을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("appeals")
    .insert({ post_id: parsed.data.postId, author_id: viewer.id, statement: parsed.data.statement });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 검토 중인 소명이 있어요." };
    if (error.message.includes("appeal_limit")) return { ok: false, error: "이 게시물은 소명을 모두 사용했어요." };
    return { ok: false, error: "소명할 수 없는 게시물이에요." };
  }
  revalidatePath(`/p/${parsed.data.postId}`);
  revalidatePath("/admin/reports");
  return { ok: true };
}

/** 내가 숨긴 글을 다시 게시한다. 운영자가 게시 중단한 글은 DB가 막는다 (소명으로만). */
export async function republishPost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "published" })
    .eq("id", id.data)
    .eq("author_id", viewer.id)
    .eq("status", "hidden")
    .is("removed_at", null)
    .select("id");
  if (error || !data?.length) return { ok: false, error: "다시 게시하지 못했어요." };

  revalidatePath("/");
  return { ok: true };
}

const claimSchema = z.object({
  creditId: z.uuid(),
  note: z
    .string()
    .trim()
    .max(300, "300자까지 적을 수 있어요.")
    .refine((v) => !/\p{Cc}/u.test(v), "쓸 수 없는 문자가 있어요."),
});

/** 미가입 크레딧 연결 요청. 볼 수 있는 남의 글 · 하루 10건 · 중복은 DB가 다시 확인한다. */
export async function claimCredit(input: z.input<typeof claimSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "내용을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("credit_claims")
    .insert({ credit_id: parsed.data.creditId, claimant_id: viewer.id, note: parsed.data.note });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 요청했어요. 업로더의 확인을 기다려 주세요." };
    if (error.message.includes("claim_rate_limited")) return { ok: false, error: "오늘은 더 요청할 수 없어요. 내일 다시 시도해 주세요." };
    return { ok: false, error: "요청할 수 없는 크레딧이에요." };
  }
  return { ok: true };
}

/** 저장 · 저장 취소 (본인만 보는 목록, 작성자에게 알리지 않음). 볼 수 있는 글인지 · 5000개 제한은 DB가 확인한다. */
export async function setBookmark(postId: string, save: boolean): Promise<{ ok: boolean; error?: string }> {
  const id = idSchema.safeParse(postId);
  if (!id.success || typeof save !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = save
    ? await supabase.from("bookmarks").upsert({ user_id: viewer.id, post_id: id.data }, { onConflict: "user_id,post_id", ignoreDuplicates: true })
    : await supabase.from("bookmarks").delete().eq("user_id", viewer.id).eq("post_id", id.data);
  if (error) {
    if (error.message.includes("bookmark_limit")) return { ok: false, error: "5000개까지 저장할 수 있어요." };
    return { ok: false, error: save ? "저장하지 못했어요." : "저장을 취소하지 못했어요." };
  }
  revalidatePath("/me/saved");
  return { ok: true };
}

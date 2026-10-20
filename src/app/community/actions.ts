"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { boardErrorMessage, messageErrorMessage } from "@/lib/boards/labels";
import { boardPostSchema, castingFormSchema } from "@/lib/boards/schema";
import { COMMENT_REPORT_REASONS } from "@/lib/comments/limits";
import { createClient } from "@/lib/supabase/server";

// 커뮤니티 게시판 · 섭외 지원. 권한 · 성인 확인 · 정지는 DB가 다시 확인한다.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function member() {
  const viewer = await getViewer();
  return viewer?.profile ? { viewer, supabase: await createClient() } : null;
}

export async function saveBoardPost(id: string | null, input: z.input<typeof boardPostSchema>): Promise<Result<{ id: string }>> {
  const parsed = boardPostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  if (id !== null && !z.uuid().safeParse(id).success) return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };

  const { board, title, body, region, castingKind, castingTerms, shootOn } = parsed.data;
  // 구인 · 섭외는 쉰다: 새 글은 받지 않는다 (예전 글 고치기는 된다)
  if (!id && board === "casting") return { ok: false, error: "구인 · 섭외 게시판은 지금 쉬고 있어요." };
  const fields = { title, body, region, casting_kind: castingKind, casting_terms: castingTerms, shoot_on: shootOn };
  const { data, error } = id
    ? await m.supabase.from("board_posts").update(fields).eq("id", id).select("id").single()
    : await m.supabase.from("board_posts").insert({ ...fields, board, author_id: m.viewer.id }).select("id").single();
  if (error) return { ok: false, error: boardErrorMessage(error.message) };
  revalidatePath("/community");
  return { ok: true, id: data.id };
}

export async function closeBoardPost(id: string, close: boolean): Promise<Result> {
  if (!z.uuid().safeParse(id).success || typeof close !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase
    .from("board_posts")
    .update({ closed_at: close ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error || !data.length) return { ok: false, error: boardErrorMessage(error?.message) };
  revalidatePath(`/community/${id}`);
  revalidatePath("/community");
  return { ok: true };
}

export async function deleteBoardPost(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase.from("board_posts").delete().eq("id", id).select("id");
  if (error || !data.length) return { ok: false, error: "지울 수 없는 글이에요." };
  revalidatePath("/community");
  return { ok: true };
}

const replySchema = z.object({ postId: z.uuid(), body: z.string().trim().min(1, "답글을 적어 주세요.").max(2000) });

export async function addReply(input: z.input<typeof replySchema>): Promise<Result> {
  const parsed = replySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "답글을 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { error } = await m.supabase
    .from("board_replies")
    .insert({ board_post_id: parsed.data.postId, author_id: m.viewer.id, body: parsed.data.body });
  if (error) return { ok: false, error: boardErrorMessage(error.message) };
  revalidatePath(`/community/${parsed.data.postId}`);
  return { ok: true };
}

export async function editReply(input: { postId: string; id: string; body: string }): Promise<Result> {
  const parsed = replySchema.extend({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "답글을 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase.from("board_replies").update({ body: parsed.data.body }).eq("id", parsed.data.id).select("id");
  if (error || !data.length) return { ok: false, error: boardErrorMessage(error?.message) };
  revalidatePath(`/community/${parsed.data.postId}`);
  return { ok: true };
}

export async function deleteReply(input: { postId: string; id: string }): Promise<Result> {
  if (!z.uuid().safeParse(input.postId).success || !z.uuid().safeParse(input.id).success) return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase.from("board_replies").delete().eq("id", input.id).select("id");
  if (error || !data.length) return { ok: false, error: "지울 수 없는 답글이에요." };
  revalidatePath(`/community/${input.postId}`);
  return { ok: true };
}

const reportSchema = z.object({
  postId: z.uuid(),
  replyId: z.uuid().nullable(),
  reason: z.enum(COMMENT_REPORT_REASONS),
});

export async function reportBoard(input: z.input<typeof reportSchema>): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "신고 내용을 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { error } = await m.supabase.from("board_reports").insert({
    reporter_id: m.viewer.id,
    board_post_id: parsed.data.postId,
    reply_id: parsed.data.replyId,
    reason: parsed.data.reason,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 신고했어요." };
    if (error.message.includes("report_rate_limited")) return { ok: false, error: "오늘은 더 신고할 수 없어요." };
    return { ok: false, error: "신고하지 못했어요." };
  }
  revalidatePath("/admin/reports");
  return { ok: true };
}

/** 만 19세 이상 확인 (생년월일은 확인에만 쓰고 저장하지 않는다) */
export async function confirmAdult(birthDate: string): Promise<Result<{ adult: boolean }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return { ok: false, error: "생년월일을 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase.rpc("confirm_adult", { birth_date: birthDate });
  if (error) return { ok: false, error: "생년월일을 확인해 주세요." };
  revalidatePath("/community", "layout");
  return { ok: true, adult: data };
}

const applySchema = z.object({
  postId: z.uuid(),
  recipient: z.uuid(),
  body: z.string().trim().min(1, "인사말을 적어 주세요.").max(2000),
  form: castingFormSchema,
});

/** 섭외 지원: 문의서를 첫 메시지로 대화를 연다 */
export async function applyCasting(input: z.input<typeof applySchema>): Promise<Result<{ threadId: string }>> {
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "문의서를 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase.rpc("start_thread", {
    recipient: parsed.data.recipient,
    body: parsed.data.body,
    casting_post: parsed.data.postId,
    form: parsed.data.form,
  });
  if (error) return { ok: false, error: messageErrorMessage(error.message) };
  revalidatePath("/me/messages");
  return { ok: true, threadId: data };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { COMMENT_REPORT_REASONS, commentBody, commentErrorMessage } from "@/lib/comments/input";
import { createClient } from "@/lib/supabase/server";

// 댓글 (P-04). 누가 무엇을 할 수 있는지는 RLS · 트리거가 다시 확인한다.

type Result = { ok: true } | { ok: false; error: string };

const addSchema = z.object({ postId: z.uuid(), parentId: z.uuid().nullable(), body: commentBody });

export async function addComment(input: z.input<typeof addSchema>): Promise<Result> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "댓글을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { postId, parentId, body } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: viewer.id, parent_id: parentId, body });
  if (error) return { ok: false, error: commentErrorMessage(error.message) };
  revalidatePath(`/p/${postId}`);
  return { ok: true };
}

const editSchema = z.object({ postId: z.uuid(), id: z.uuid(), body: commentBody });

export async function editComment(input: z.input<typeof editSchema>): Promise<Result> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "댓글을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("comments").update({ body: parsed.data.body }).eq("id", parsed.data.id).select("id");
  if (error) return { ok: false, error: commentErrorMessage(error.message) };
  if (!data.length) return { ok: false, error: "고칠 수 없는 댓글이에요." };
  revalidatePath(`/p/${parsed.data.postId}`);
  return { ok: true };
}

const targetSchema = z.object({ postId: z.uuid(), id: z.uuid() });

export async function deleteComment(input: z.input<typeof targetSchema>): Promise<Result> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("comments").delete().eq("id", parsed.data.id).select("id");
  if (error || !data.length) return { ok: false, error: "지울 수 없는 댓글이에요." };
  revalidatePath(`/p/${parsed.data.postId}`);
  return { ok: true };
}

export async function pinComment(input: z.input<typeof targetSchema> & { pin: boolean }): Promise<Result> {
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("pin_comment", { target: parsed.data.id, pin: input.pin === true });
  if (error) return { ok: false, error: "고정하지 못했어요." };
  revalidatePath(`/p/${parsed.data.postId}`);
  return { ok: true };
}

const reportSchema = z.object({
  id: z.uuid(),
  reason: z.enum(COMMENT_REPORT_REASONS),
  detail: z.string().trim().max(1000).default(""),
});

export async function reportComment(input: z.input<typeof reportSchema>): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "신고 내용을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase.from("comment_reports").insert({
    reporter_id: viewer.id,
    comment_id: parsed.data.id,
    reason: parsed.data.reason,
    detail: parsed.data.detail,
  });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "이미 신고한 댓글이에요." };
    if (error.message.includes("report_rate_limited")) return { ok: false, error: "오늘은 더 신고할 수 없어요. 내일 다시 시도해 주세요." };
    return { ok: false, error: "신고하지 못했어요." };
  }
  revalidatePath("/admin/reports");
  return { ok: true };
}

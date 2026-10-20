"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { messageErrorMessage } from "@/lib/boards/labels";
import { COMMENT_REPORT_REASONS } from "@/lib/comments/limits";
import { createClient } from "@/lib/supabase/server";

// 메시지 (S-16). 당사자 확인 · 차단 · 받기 설정 · 링크 제한은 DB 함수가 맡는다.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function member() {
  const viewer = await getViewer();
  return viewer?.profile ? { viewer, supabase: await createClient() } : null;
}

const body = z.string().trim().min(1, "메시지를 적어 주세요.").max(2000, "2000자까지 보낼 수 있어요.");

export async function startThread(input: { recipient: string; body: string }): Promise<Result<{ threadId: string }>> {
  const parsed = z.object({ recipient: z.uuid(), body }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "메시지를 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { data, error } = await m.supabase.rpc("start_thread", { recipient: parsed.data.recipient, body: parsed.data.body });
  if (error) return { ok: false, error: messageErrorMessage(error.message) };
  revalidatePath("/me/messages");
  return { ok: true, threadId: data };
}

export async function sendMessage(input: { threadId: string; body: string }): Promise<Result> {
  const parsed = z.object({ threadId: z.uuid(), body }).safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "메시지를 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { error } = await m.supabase.rpc("send_message", { thread: parsed.data.threadId, body: parsed.data.body });
  if (error) return { ok: false, error: messageErrorMessage(error.message) };
  revalidatePath(`/me/messages/${parsed.data.threadId}`);
  revalidatePath("/me/messages");
  return { ok: true };
}

export async function respondThread(threadId: string, accept: boolean): Promise<Result> {
  if (!z.uuid().safeParse(threadId).success || typeof accept !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { error } = await m.supabase.rpc("respond_thread", { thread: threadId, accept });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/me/messages");
  revalidatePath(`/me/messages/${threadId}`);
  return { ok: true };
}

/** 대화를 열면 읽음 처리 (화면에서 실행 — 링크 미리 가져오기로는 읽음 처리되지 않게) */
export async function markThreadRead(threadId: string): Promise<void> {
  if (!z.uuid().safeParse(threadId).success) return;
  const m = await member();
  if (!m) return;
  await m.supabase.rpc("mark_thread_read", { thread: threadId });
  revalidatePath("/me/messages");
  revalidatePath("/notifications");
}

export async function dismissGuide(threadId: string): Promise<void> {
  if (!z.uuid().safeParse(threadId).success) return;
  const m = await member();
  if (!m) return;
  await m.supabase.rpc("dismiss_thread_guide", { thread: threadId });
  revalidatePath(`/me/messages/${threadId}`);
}

const reportSchema = z.object({
  threadId: z.uuid(),
  reason: z.enum(COMMENT_REPORT_REASONS),
  detail: z.string().trim().max(1000).default(""),
  alsoBlock: z.boolean(),
});

export async function reportThread(input: z.input<typeof reportSchema>): Promise<Result> {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "신고 내용을 확인해 주세요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { error } = await m.supabase.rpc("report_thread", {
    thread: parsed.data.threadId,
    reason: parsed.data.reason,
    detail: parsed.data.detail,
    also_block: parsed.data.alsoBlock,
  });
  if (error) return { ok: false, error: error.message.includes("report_rate_limited") ? "오늘은 더 신고할 수 없어요." : "신고하지 못했어요." };
  revalidatePath("/me/messages");
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function setBlock(userId: string, block: boolean): Promise<Result> {
  if (!z.uuid().safeParse(userId).success || typeof block !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const { error } = block
    ? await m.supabase.from("blocks").insert({ blocker_id: m.viewer.id, blocked_id: userId })
    : await m.supabase.from("blocks").delete().eq("blocker_id", m.viewer.id).eq("blocked_id", userId);
  if (error && error.code !== "23505") return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/me/messages");
  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function setMessageReceive(receive: "everyone" | "following" | "none"): Promise<Result> {
  if (!["everyone", "following", "none"].includes(receive)) return { ok: false, error: "잘못된 요청이에요." };
  const m = await member();
  if (!m) return { ok: false, error: "로그인이 필요해요." };
  const updated = await m.supabase
    .from("message_settings")
    .update({ receive, updated_at: new Date().toISOString() })
    .eq("user_id", m.viewer.id)
    .select("user_id");
  let error = updated.error;
  if (!error && !updated.data?.length) ({ error } = await m.supabase.from("message_settings").insert({ user_id: m.viewer.id, receive }));
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings", "layout");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  postId: z.uuid(),
  decision: z.enum(["dismiss", "hold", "hide", "release", "restore", "quarantine"]),
  note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
});

/** 신고 처리 (A-04 ⑦ · ⑧). 권한 · 사유 필수 · 감사 로그는 DB 함수가 다시 확인한다. */
export async function moderate(input: z.input<typeof schema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };

  const supabase = await createClient();
  // 격리는 휴지통 · 차단 해시 · 보존을 함께 하는 별도 함수로 (A-04)
  const { error } =
    parsed.data.decision === "quarantine"
      ? await supabase.rpc("admin_posts_action", { targets: [parsed.data.postId], action: "quarantine", note: parsed.data.note })
      : await supabase.rpc("moderate_post", { target: parsed.data.postId, decision: parsed.data.decision, note: parsed.data.note });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/admin/reports");
  revalidatePath("/");
  return { ok: true };
}

const commentSchema = z.object({
  commentId: z.uuid(),
  decision: z.enum(["dismiss", "hide"]),
  note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
});

/** 댓글 신고 처리. 권한 · 사유 필수 · 감사 로그는 DB 함수가 다시 확인한다. */
export async function moderateComment(input: z.input<typeof commentSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_comment", {
    target: parsed.data.commentId,
    decision: parsed.data.decision,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/admin/reports");
  return { ok: true };
}

const boardSchema = z.object({
  postId: z.uuid(),
  replyId: z.uuid().nullable(),
  decision: z.enum(["dismiss", "hide"]),
  note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
});

/** 게시판 글 · 답글 신고 처리 */
export async function moderateBoard(input: z.input<typeof boardSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = boardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderate_board", {
    target_post: parsed.data.postId,
    target_reply: parsed.data.replyId,
    decision: parsed.data.decision,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/admin/reports");
  return { ok: true };
}

export type ReportedMessage = { id: number; sender: string | null; body: string; form: Record<string, string> | null; createdAt: string };

/** 신고된 대화 열기 (누를 때만, 열 때마다 감사 로그가 남는다) */
export async function openReportedThread(reportId: string): Promise<{ ok: true; messages: ReportedMessage[] } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(reportId).success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 열 수 있어요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reported_thread", { report: reportId });
  if (error) return { ok: false, error: "대화를 열지 못했어요." };
  return {
    ok: true,
    messages: data
      .map((m) => ({
        id: m.message_id,
        sender: m.sender_handle,
        body: m.body,
        form: m.form && typeof m.form === "object" && !Array.isArray(m.form) ? (m.form as Record<string, string>) : null,
        createdAt: m.created_at,
      }))
      .reverse(),
  };
}

const messageReportSchema = z.object({
  reportId: z.uuid(),
  decision: z.enum(["dismiss", "actioned"]),
  note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
});

export async function resolveMessageReport(input: z.input<typeof messageReportSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = messageReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_message_report", {
    report: parsed.data.reportId,
    decision: parsed.data.decision,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/admin/reports");
  return { ok: true };
}

const claimSchema = z.object({ claimId: z.uuid(), accept: z.boolean() });

/** 크레딧 연결 요청 처리 (운영자 · 2단계 인증 세션만, DB 함수가 다시 확인) */
export async function resolveClaim(input: z.input<typeof claimSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 처리할 수 있어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_credit_claim", { target: parsed.data.claimId, accept: parsed.data.accept });
  if (error) return { ok: false, error: "처리하지 못했어요. 이미 처리된 요청일 수 있어요." };
  revalidatePath("/admin/reports");
  revalidatePath("/", "layout");
  return { ok: true };
}

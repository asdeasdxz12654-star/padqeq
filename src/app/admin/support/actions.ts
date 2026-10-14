"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { noticeSchema } from "@/lib/support/inquiry-input";

type Result = { ok: true } | { ok: false; error: string };

async function adminClient() {
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return null;
  return { viewer, supabase: await createClient() };
}

const answerSchema = z.object({
  id: z.uuid(),
  reply: z.string().trim().min(1, "답변을 적어 주세요.").max(3000),
});

/** 문의 답변 (다시 답하면 바꾼다). 답하면 회원에게 알림. */
export async function answerInquiry(input: z.input<typeof answerSchema>): Promise<Result> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const admin = await adminClient();
  if (!admin) return { ok: false, error: "운영자만 처리할 수 있어요." };
  const { error } = await admin.supabase.rpc("answer_inquiry", { target: parsed.data.id, reply: parsed.data.reply });
  if (error) return { ok: false, error: "답변을 저장하지 못했어요." };
  revalidatePath("/admin/support");
  return { ok: true };
}

/** 공지 쓰기 · 고치기 */
export async function saveNotice(input: z.input<typeof noticeSchema>): Promise<Result & { id?: string }> {
  const parsed = noticeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const admin = await adminClient();
  if (!admin) return { ok: false, error: "운영자만 쓸 수 있어요." };

  const { id, category, title, body, maintenanceAt, pinned } = parsed.data;
  const fields = { category, title, body, maintenance_at: maintenanceAt, pinned };
  const { data, error } = id
    ? await admin.supabase.from("notices").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", id).select("id").single()
    : await admin.supabase.from("notices").insert({ ...fields, created_by: admin.viewer.id }).select("id").single();
  if (error) return { ok: false, error: "공지를 저장하지 못했어요." };
  revalidatePath("/help");
  revalidatePath("/admin/support");
  return { ok: true, id: data.id };
}

export async function deleteNotice(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "잘못된 요청이에요." };
  const admin = await adminClient();
  if (!admin) return { ok: false, error: "운영자만 지울 수 있어요." };
  const { error } = await admin.supabase.from("notices").delete().eq("id", id);
  if (error) return { ok: false, error: "공지를 지우지 못했어요." };
  revalidatePath("/help");
  revalidatePath("/admin/support");
  return { ok: true };
}

const switchSchema = z.object({
  readOnly: z.boolean(),
  signupClosed: z.boolean(),
  uploadsClosed: z.boolean(),
  message: z.string().trim().max(200),
  note: z.string().trim().min(1, "바꾸는 이유를 적어 주세요.").max(500),
});

/** 긴급 스위치 (A-05 ②). 감사 로그는 DB 함수가 남긴다. */
export async function setSwitches(input: z.input<typeof switchSchema>): Promise<Result> {
  const parsed = switchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const admin = await adminClient();
  if (!admin) return { ok: false, error: "운영자만 바꿀 수 있어요." };
  const { readOnly, signupClosed, uploadsClosed, message, note } = parsed.data;
  const { error } = await admin.supabase.rpc("set_site_switches", {
    read_only: readOnly,
    signup_closed: signupClosed,
    uploads_closed: uploadsClosed,
    message,
    note,
  });
  if (error) return { ok: false, error: "스위치를 바꾸지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true };
}

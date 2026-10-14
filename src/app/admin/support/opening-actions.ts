"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

// 운영 단계 · 초대 코드 · 금칙어 (A-05). 권한 · 감사 로그는 DB 함수 · RLS가 다시 확인한다.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function admin() {
  const viewer = await getViewer();
  return viewer?.profile?.role === "admin" ? { viewer, supabase: await createClient() } : null;
}

export async function setUploadStage(stage: "solo" | "invite" | "open", note: string): Promise<Result> {
  const parsed = z.object({ stage: z.enum(["solo", "invite", "open"]), note: z.string().trim().min(1, "바꾸는 이유를 적어 주세요.").max(500) }).safeParse({ stage, note });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 바꿀 수 있어요." };
  const { error } = await a.supabase.rpc("set_upload_stage", { stage: parsed.data.stage, note: parsed.data.note });
  if (error) return { ok: false, error: "단계를 바꾸지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function createInvite(input: { maxUses: number; days: number; note: string }): Promise<Result<{ code: string }>> {
  const parsed = z
    .object({ maxUses: z.int().min(1).max(1000), days: z.int().min(1).max(365), note: z.string().trim().max(100) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "사용 횟수(1~1000)와 기한(1~365일)을 확인해 주세요." };
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 만들 수 있어요." };
  const { data, error } = await a.supabase.rpc("create_invite_code", {
    max_uses: parsed.data.maxUses,
    days: parsed.data.days,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: "초대 코드를 만들지 못했어요." };
  revalidatePath("/admin/support");
  return { ok: true, code: data };
}

export async function revokeInvite(code: string): Promise<Result> {
  if (!/^[A-HJ-NP-Z2-9]{8}$/.test(code)) return { ok: false, error: "잘못된 코드예요." };
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 할 수 있어요." };
  const { error } = await a.supabase.rpc("revoke_invite_code", { target: code });
  if (error) return { ok: false, error: "막지 못했어요." };
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function addBannedWord(word: string): Promise<Result> {
  const value = word.trim().toLowerCase();
  if (!value || value.length > 40) return { ok: false, error: "1~40자로 적어 주세요." };
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 할 수 있어요." };
  const { error } = await a.supabase.from("banned_words").insert({ word: value, created_by: a.viewer.id });
  if (error) return { ok: false, error: error.code === "23505" ? "이미 있는 말이에요." : "넣지 못했어요." };
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function removeBannedWord(word: string): Promise<Result> {
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 할 수 있어요." };
  const { error } = await a.supabase.from("banned_words").delete().eq("word", word);
  if (error) return { ok: false, error: "빼지 못했어요." };
  revalidatePath("/admin/support");
  return { ok: true };
}

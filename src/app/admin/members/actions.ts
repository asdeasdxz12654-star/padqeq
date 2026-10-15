"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isStaffRole, roleErrorMessage, roleSchema } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { sanctionErrorMessage, sanctionSchema } from "@/lib/moderation/sanctions";
import { createClient } from "@/lib/supabase/server";

/** 회원 제재 (A-05). 운영 도우미는 경고만. 권한 · 운영자 제외 · 감사 로그 · 알림은 DB 함수가 맡는다. */
export async function sanction(input: z.input<typeof sanctionSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = sanctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!isStaffRole(viewer?.profile?.role)) return { ok: false, error: "운영자만 처리할 수 있어요." };
  if (viewer?.profile?.role !== "admin" && parsed.data.action !== "warn") return { ok: false, error: "운영 도우미는 경고만 할 수 있어요." };

  const { memberId, action, note, days, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("sanction_member", { target: memberId, action, note, days, reason });
  if (error) return { ok: false, error: sanctionErrorMessage(error.message) };
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${memberId}`);
  return { ok: true };
}

/** 이메일 원문 열람 (A-05 ④): 사유를 적어야 보이고, 열람은 감사 로그에 남는다. */
export async function revealEmail(memberId: string, reason: string): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const parsedId = z.uuid().safeParse(memberId);
  const parsedReason = z.string().trim().min(2, "열람 사유를 적어 주세요.").max(200).safeParse(reason);
  if (!parsedId.success) return { ok: false, error: "회원을 찾지 못했어요." };
  if (!parsedReason.success) return { ok: false, error: parsedReason.error.issues[0]?.message ?? "열람 사유를 적어 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "운영자만 볼 수 있어요." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reveal_email", { target: parsedId.data, reason: parsedReason.data });
  if (error) return { ok: false, error: "열람하지 못했어요." };
  return { ok: true, email: data };
}

/** 역할 지정 (최고 관리자만): 회원 ↔ 운영 도우미. 사유는 감사 로그에 남는다. */
export async function setRole(input: z.input<typeof roleSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "최고 관리자만 바꿀 수 있어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", { target: parsed.data.memberId, new_role: parsed.data.role, note: parsed.data.note });
  if (error) return { ok: false, error: roleErrorMessage(error.message) };
  revalidatePath("/admin/members");
  revalidatePath(`/admin/members/${parsed.data.memberId}`);
  return { ok: true };
}

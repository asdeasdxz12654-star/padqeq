"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES } from "@/lib/photos/post-input";
import { createClient } from "@/lib/supabase/server";

/** 크레딧 자동 승인 켜기 · 끄기 (S-10 ③). 켜도 내가 팔로우하는 회원의 태그만 자동으로 승인한다 (DB가 판단). */
export async function setCreditAutoApprove(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof on !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ credit_auto_approve: on }).eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings");
  return { ok: true };
}

/** 관심 분야 (S-01 ⑤): 홈 추천 순서에 반영된다. 4개까지 */
export async function setInterests(categories: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.array(z.enum(CATEGORIES)).max(4).safeParse(categories);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ interest_categories: [...new Set(parsed.data)] }).eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 'N년 전 오늘' · 연말 결산 알림 켜기 · 끄기 (S-18 알림 · 설정) */
export async function setMemoryAlerts(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ memory_alerts: on === true }).eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings");
  return { ok: true };
}

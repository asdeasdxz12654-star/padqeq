"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORIES } from "@/lib/photos/categories";
import { createClient } from "@/lib/supabase/server";

/** 크레딧 자동 승인 켜기 · 끄기 (S-10 ③). 켜도 내가 팔로우하는 회원의 태그만 자동으로 승인한다 (DB가 판단). */
export async function setCreditAutoApprove(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof on !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ credit_auto_approve: on }).eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings", "layout");
  return { ok: true };
}

/** 관심 분야 (S-01 ⑤): 홈 추천 순서에 반영된다. 분류 수만큼(5개)까지 */
export async function setInterests(categories: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).safeParse(categories);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ interest_categories: [...new Set(parsed.data)] }).eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true };
}

/** 가림 표시 사진을 가리지 않고 바로 보기 (S-14 ①) */
export async function setShowVeiled(on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ show_veiled: on === true }).eq("id", viewer.id);
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
  revalidatePath("/settings", "layout");
  return { ok: true };
}

const ADMIN_ALERT_MODES = ["all", "urgent", "off"] as const;
export type AdminAlertMode = (typeof ADMIN_ALERT_MODES)[number];

/** 운영 알림 받는 방식 (운영진만, 관리 시안 44): 긴급 + 하루 요약 · 긴급만 · 받지 않음. 운영진인지는 DB가 다시 확인한다. */
export async function setAdminAlerts(mode: AdminAlertMode): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!ADMIN_ALERT_MODES.includes(mode)) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  // upsert는 user_id까지 다시 쓰려 해서 권한(열 단위 update)에 막힌다 → 바꾸고, 없으면 만든다
  const values = { mode, updated_at: new Date().toISOString() };
  const updated = await supabase.from("admin_alert_settings").update(values).eq("user_id", viewer.id).select("user_id");
  const { error } = updated.error || updated.data.length > 0 ? updated : await supabase.from("admin_alert_settings").insert({ user_id: viewer.id, ...values });
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings/alerts");
  return { ok: true };
}

const NOTIFICATION_PREFS = ["likes", "comments", "messages", "events"] as const;
export type NotificationPref = (typeof NOTIFICATION_PREFS)[number];

/** 알림 종류별로 받기 (회원 시안 46): 끈 종류는 DB가 알림을 만들지 않는다 */
export async function setNotificationPref(pref: NotificationPref, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!NOTIFICATION_PREFS.includes(pref) || typeof on !== "boolean") return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const values = { ...({ [pref]: on } as Partial<Record<NotificationPref, boolean>>), updated_at: new Date().toISOString() };
  const updated = await supabase.from("notification_prefs").update(values).eq("user_id", viewer.id).select("user_id");
  const { error } = updated.error || updated.data.length > 0 ? updated : await supabase.from("notification_prefs").insert({ user_id: viewer.id, ...values });
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath("/settings/alerts");
  return { ok: true };
}

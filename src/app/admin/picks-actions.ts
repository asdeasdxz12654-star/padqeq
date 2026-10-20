"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

// 대시보드 '오늘의 픽' 칸. 순서는 지우고 새 순서로 다시 넣는다 (넣는 순서대로 자리가 매겨진다, DB 트리거).

type Result = { ok: true } | { ok: false; error: string };

async function admin() {
  const viewer = await getViewer();
  return viewer?.profile?.role === "admin" ? { viewer, supabase: await createClient() } : null;
}

/** 오늘의 픽 순서 바꾸기 */
export async function reorderTodayPicks(ids: string[]): Promise<Result> {
  const parsed = z.array(z.uuid()).max(10).safeParse(ids);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 할 수 있어요." };
  const today = todayKst();
  const { error: removeError } = await a.supabase.from("daily_picks").delete().eq("pick_date", today);
  if (removeError) return { ok: false, error: "순서를 바꾸지 못했어요." };
  for (const postId of parsed.data) {
    const { error } = await a.supabase.from("daily_picks").insert({ pick_date: today, post_id: postId, created_by: a.viewer.id });
    if (error) return { ok: false, error: "순서를 바꾸지 못했어요. 새로 고침 해 주세요." };
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

/** 가장 최근 날의 픽을 오늘 픽으로 이어 쓰기 (오늘 고른 것이 없을 때) */
export async function copyLatestPicks(): Promise<Result> {
  const a = await admin();
  if (!a) return { ok: false, error: "운영자만 할 수 있어요." };
  const today = todayKst();
  const { data } = await a.supabase.from("daily_picks").select("pick_date, post_id").lt("pick_date", today).order("pick_date", { ascending: false }).order("position").limit(10);
  const latest = data?.[0]?.pick_date;
  if (!latest) return { ok: false, error: "이어 쓸 지난 픽이 없어요." };
  for (const row of (data ?? []).filter((r) => r.pick_date === latest)) {
    const { error } = await a.supabase.from("daily_picks").insert({ pick_date: today, post_id: row.post_id, created_by: a.viewer.id });
    // 이미 있거나(23505) 볼 수 없게 된 글은 건너뛴다
    if (error && error.code !== "23505" && !error.message.includes("row-level security")) return { ok: false, error: "이어 쓰지 못했어요." };
  }
  revalidatePath("/");
  revalidatePath("/admin");
  return { ok: true };
}

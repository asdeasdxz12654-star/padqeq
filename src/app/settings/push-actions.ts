"use server";

import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const endpointSchema = z.string().url().startsWith("https://").max(1000);

/** 이 기기에서 웹 푸시 받기 (S-11). 같은 기기를 다른 계정이 쓰던 연결은 DB가 옮긴다. */
export async function registerPush(endpoint: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "이 브라우저의 알림 주소를 확인하지 못했어요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_push_subscription", { endpoint: parsed.data });
  return error ? { ok: false, error: "알림을 켜지 못했어요." } : { ok: true };
}

/** 이 기기에서 그만 받기 */
export async function unregisterPush(endpoint: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = endpointSchema.safeParse(endpoint);
  if (!parsed.success) return { ok: true };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", viewer.id).eq("endpoint", parsed.data);
  return error ? { ok: false, error: "알림을 끄지 못했어요." } : { ok: true };
}

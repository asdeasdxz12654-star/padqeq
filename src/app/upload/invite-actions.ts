"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 초대 코드로 업로드 열기 (A-05 ① 초대 회원 단계). 틀린 코드 · 시도 횟수는 DB가 센다. */
export async function redeemInvite(input: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const code = input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (code.length !== 8) return { ok: false, error: "초대 코드 8자리를 넣어 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_invite_code", { input: code });
  if (error) {
    if (error.message.includes("invite_rate_limited")) return { ok: false, error: "너무 많이 시도했어요. 한 시간 뒤에 다시 해 주세요." };
    if (error.message.includes("invites_closed")) return { ok: false, error: "지금은 초대 코드를 받지 않아요." };
    if (error.message.includes("upload_revoked")) return { ok: false, error: "운영 정책에 따라 업로드 권한이 회수된 계정이에요. 1:1 문의로 알려 주세요." };
    if (error.message.includes("already_uploader")) return { ok: true };
    if (error.message.includes("member_suspended")) return { ok: false, error: "이용이 제한된 기간이에요." };
    return { ok: false, error: "코드를 확인하지 못했어요." };
  }
  if (data !== "ok") return { ok: false, error: "맞지 않거나 기한 · 횟수가 끝난 코드예요." };
  revalidatePath("/upload");
  revalidatePath("/", "layout");
  return { ok: true };
}

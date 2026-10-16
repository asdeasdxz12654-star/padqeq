"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

/** 회원이 제안한 태그를 공식으로 (최고 관리자). 권한은 DB 함수가 다시 확인한다. */
export async function approveTag(tagId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z.uuid().safeParse(tagId);
  if (!parsed.success) return { ok: false, error: "태그를 찾지 못했어요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: "최고 관리자만 승인할 수 있어요. (2단계 인증 필요)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_tag", { target: parsed.data });
  if (error) return { ok: false, error: "승인하지 못했어요. 잠시 뒤 다시 해 주세요." };
  revalidatePath("/admin/tags");
  revalidatePath("/t/[slug]", "page");
  return { ok: true };
}

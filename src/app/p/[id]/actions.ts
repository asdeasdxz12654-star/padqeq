"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { getPost, type ViewerPhoto } from "@/lib/posts/get-post";
import { createClient } from "@/lib/supabase/server";

const idSchema = z.uuid();

/** 화면을 오래 열어 두어 서명 주소가 만료됐을 때 새 주소를 받는다 (권한은 다시 확인) */
export async function refreshPhotoSources(postId: string): Promise<ViewerPhoto[] | null> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return null;
  return (await getPost(id.data))?.photos ?? null;
}

/**
 * 게시 중단(숨김). 삭제는 30일 복구 기간을 두고 운영 화면에서 처리하므로(P-01) 여기서는 숨기기만 한다.
 * 작성자 · 운영자만 (RLS).
 */
export async function hidePost(postId: string): Promise<{ ok: boolean; error?: string }> {
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .update({ status: "hidden" })
    .eq("id", id.data)
    .eq("status", "published")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "숨기지 못했어요." };

  revalidatePath("/");
  return { ok: true };
}

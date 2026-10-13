"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";

/** 이 기기에서만 로그아웃 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/");
}

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "표시 이름을 입력해 주세요.")
    .max(40, "표시 이름은 40자까지예요.")
    .refine((v) => !/\p{Cc}/u.test(v), "쓸 수 없는 문자가 있어요."),
  // 소개는 줄바꿈만 허용
  bio: z
    .string()
    .trim()
    .max(300, "소개는 300자까지예요.")
    .refine((v) => !/\p{Cc}/u.test(v.replace(/\r?\n/g, "")), "쓸 수 없는 문자가 있어요."),
});

/** 표시 이름 · 소개 고치기 (핸들 · 역할은 바꿀 수 없다: DB 열 권한) */
export async function updateProfile(input: { displayName: string; bio: string }): Promise<{ ok: boolean; error?: string }> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, bio: parsed.data.bio.replace(/\r\n?/g, "\n") })
    .eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath(profileHref(viewer.profile.handle));
  return { ok: true };
}

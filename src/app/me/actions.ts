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
const linksSchema = z
  .array(z.string().trim().max(200, "링크는 200자까지예요."))
  .max(3)
  .transform((all) => all.filter(Boolean))
  .refine((all) => all.every((v) => /^https:\/\/[^\s]+$/.test(v)), "링크는 https:// 로 시작하는 주소만 넣을 수 있어요.");

export async function updateProfile(input: { displayName: string; bio: string; links?: string[] }): Promise<{ ok: boolean; error?: string }> {
  const parsed = profileSchema.safeParse(input);
  const links = linksSchema.safeParse(input.links ?? []);
  if (!links.success) return { ok: false, error: links.error.issues[0]?.message };
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, bio: parsed.data.bio.replace(/\r\n?/g, "\n"), links: links.data })
    .eq("id", viewer.id);
  if (error) return { ok: false, error: "저장하지 못했어요." };
  revalidatePath(profileHref(viewer.profile.handle));
  return { ok: true };
}

const respondSchema = z.object({ creditId: z.uuid(), decision: z.enum(["approved", "rejected"]) });

/** 나를 태그한 크레딧 승인 · 거절 (당사자만, RLS) */
export async function respondCredit(input: z.input<typeof respondSchema>): Promise<{ ok: boolean; error?: string }> {
  const parsed = respondSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credits")
    .update({ status: parsed.data.decision })
    .eq("id", parsed.data.creditId)
    .eq("member_id", viewer.id)
    .eq("status", "pending")
    .select("id");
  if (error || !data?.length) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/me");
  revalidatePath(profileHref(viewer.profile.handle));
  return { ok: true };
}

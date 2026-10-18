"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { POLICY_VERSION, type SignupField, signupErrorFromDb, signupSchema } from "@/lib/auth/signup-input";
import { headers } from "next/headers";
import { verifyTurnstile } from "@/lib/security/turnstile";
import { createClient, getUserId } from "@/lib/supabase/server";

export type SignupErrors = Partial<Record<SignupField, string>>;

/** 가입 마무리 (핸들 · 표시 이름 · 생년월일 · 동의). 성공하면 원래 가려던 곳으로 이동한다. */
export async function completeSignup(formData: FormData): Promise<SignupErrors> {
  const next = safeNextPath(formData.get("next"));
  if (!(await getUserId())) redirect(withNext("/login", next));

  const parsed = signupSchema.safeParse({
    handle: formData.get("handle"),
    displayName: formData.get("displayName"),
    birthDate: formData.get("birthDate"),
    agreeTerms: formData.get("agreeTerms"),
    agreePrivacy: formData.get("agreePrivacy"),
  });
  if (!parsed.success) {
    const errors: SignupErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      const field: SignupField = key === "agreeTerms" || key === "agreePrivacy" ? "agree" : (key as SignupField);
      errors[field] ??= issue.message;
    }
    return errors;
  }

  // 가입 봇 방지 (Turnstile). 비밀값이 없으면 건너뛴다.
  const ip = (await headers()).get("cf-connecting-ip");
  if (!(await verifyTurnstile(formData.get("cf-turnstile-response"), ip))) {
    return { form: "사람인지 확인하지 못했어요. 확인 상자를 다시 눌러 주세요." };
  }

  const { handle, displayName, birthDate } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_my_profile", {
    new_handle: handle,
    new_display_name: displayName,
    birth_date: birthDate,
    policy_version: POLICY_VERSION,
  });
  if (error) {
    const mapped = signupErrorFromDb(error.message);
    if (mapped !== "profile_exists") return { [mapped.field]: mapped.message };
  } else {
    // 만 19세 이상이면 그 사실만 기록한다 (섭외 게시판용). 생년월일은 저장하지 않는다. 실패해도 가입은 끝났다.
    await supabase.rpc("confirm_adult", { birth_date: birthDate });
  }

  // 상단 바 · 탭 등 모든 화면이 새 프로필로 다시 그려지게 (안 하면 브라우저에 남은 화면이 "가입 마무리"를 계속 보여 준다)
  revalidatePath("/", "layout");
  // 가입 직후 소개 → 관심 고르기 (S-01 ⑥ ⑦, 둘 다 건너뛸 수 있음)
  redirect(next === "/" ? "/welcome/intro" : `/welcome/intro?next=${encodeURIComponent(next)}`);
}

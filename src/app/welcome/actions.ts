"use server";

import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { POLICY_VERSION, type SignupField, signupErrorFromDb, signupSchema } from "@/lib/auth/signup-input";
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
  }

  redirect(next);
}

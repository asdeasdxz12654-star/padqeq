"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { CAPSULE_YEARS, capsuleOpenOn } from "./open-on";

type Result = { ok: true; openOn: string } | { ok: false; error: string };

const burySchema = z.object({
  postId: z.uuid(),
  letter: z
    .string()
    .transform((v) => v.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, "편지를 적어 주세요.")
        .max(1000, "편지는 1000자까지예요.")
        .refine((v) => !/\p{Cc}/u.test(v.replace(/\n/g, "")), "쓸 수 없는 문자가 있어요."),
    ),
  years: z.union(CAPSULE_YEARS.map((y) => z.literal(y))),
});

const ERRORS: Record<string, string> = {
  post_not_mine: "내가 올렸거나 크레딧된 사진에만 묻을 수 있어요.",
  open_on_invalid: "여는 날을 다시 골라 주세요.",
  too_many_capsules: "아직 열리지 않은 타임캡슐은 50개까지예요.",
  account_inactive: "지금은 타임캡슐을 묻을 수 없어요.",
};

/** 타임캡슐 묻기: N년 뒤 오늘 열린다. 그 전에는 나도 편지를 못 읽는다. */
export async function buryTimeCapsule(input: z.input<typeof burySchema>): Promise<Result> {
  const parsed = burySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인해 주세요." };
  const openOn = capsuleOpenOn(todayKst(), parsed.data.years);
  const supabase = await createClient();
  const { error } = await supabase.rpc("bury_time_capsule", { post: parsed.data.postId, letter: parsed.data.letter, open_on: openOn });
  if (error) {
    const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
    return { ok: false, error: key ? ERRORS[key]! : "타임캡슐을 묻지 못했어요." };
  }
  revalidatePath("/memories");
  return { ok: true, openOn };
}

/** 아직 열리지 않은 타임캡슐 버리기 (편지는 읽지 않은 채 지워진다) */
export async function discardTimeCapsule(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인해 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.from("time_capsules").delete().eq("id", id);
  if (error) return { ok: false, error: "지우지 못했어요." };
  revalidatePath("/memories");
  return { ok: true };
}

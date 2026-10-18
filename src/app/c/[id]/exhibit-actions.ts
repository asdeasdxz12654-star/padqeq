"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  id: z.uuid(),
  on: z.boolean(),
  note: z.string().trim().max(200, "소개는 200자까지예요.").refine((v) => !/\p{Cc}/u.test(v), "쓸 수 없는 문자가 있어요."),
});

/** 전시로 걸기 · 내리기 (최고 관리자만, DB가 다시 확인 · 감사 로그) */
export async function setExhibition(input: z.input<typeof schema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  if ((await getViewer())?.profile?.role !== "admin") return { ok: false, error: "운영자만 할 수 있어요." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_exhibition", { target: parsed.data.id, on_display: parsed.data.on, note: parsed.data.note });
  if (error) return { ok: false, error: error.message.includes("collection_not_public") ? "공개 컬렉션만 전시할 수 있어요." : "처리하지 못했어요." };
  revalidatePath(`/c/${parsed.data.id}`);
  revalidatePath("/");
  return { ok: true };
}

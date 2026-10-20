"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { REGIONS } from "@/lib/events/calendar";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const schema = z.object({
  listed: z.boolean(),
  roles: z.array(z.enum(["cosplayer", "photographer", "model", "retoucher"])).min(1, "역할을 하나 이상 골라 주세요.").max(4),
  region: z.string().refine((v) => v === "" || (REGIONS as readonly string[]).includes(v), "지역을 확인해 주세요."),
  activeSince: z.string().regex(/^(\d{4})?$/, "활동 시작 연도를 확인해 주세요."),
  works: z.string().trim().max(100),
  castingOpen: z.boolean(),
});

/** 크리에이터 정보 (디렉토리). 섭외 가능은 성인 확인을 DB가 다시 확인한다. */
export async function saveCreatorProfile(input: z.input<typeof schema>): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { listed, roles, region, activeSince, works, castingOpen } = parsed.data;
  const fields = {
    listed,
    roles: [...new Set(roles)],
    region: region || null,
    active_since: activeSince ? Number(activeSince) : null,
    works,
    casting_open: castingOpen,
  };
  const supabase = await createClient();
  const updated = await supabase.from("creator_profiles").update(fields).eq("user_id", viewer.id).select("user_id");
  let error = updated.error;
  if (!error && !updated.data?.length) ({ error } = await supabase.from("creator_profiles").insert({ ...fields, user_id: viewer.id }));
  if (error) {
    if (error.message.includes("adult_required")) return { ok: false, error: "섭외 가능은 만 19세 이상 확인을 한 회원만 켤 수 있어요." };
    if (error.message.includes("active_since")) return { ok: false, error: "활동 시작 연도를 확인해 주세요." };
    if (error.message.includes("member_suspended")) return { ok: false, error: "이용이 제한된 기간이에요." };
    return { ok: false, error: "저장하지 못했어요." };
  }
  revalidatePath("/creators");
  revalidatePath("/settings", "layout");
  return { ok: true };
}

export async function removeCreatorProfile(): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };
  const supabase = await createClient();
  const { error } = await supabase.from("creator_profiles").delete().eq("user_id", viewer.id);
  if (error) return { ok: false, error: "지우지 못했어요." };
  revalidatePath("/creators");
  revalidatePath("/settings", "layout");
  return { ok: true };
}

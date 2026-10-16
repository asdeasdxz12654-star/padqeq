"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { parseLatLng } from "@/lib/places/location";
import { createClient } from "@/lib/supabase/server";

const locationSchema = z.object({
  tagId: z.uuid(),
  /** 비우면 위치를 지운다 */
  location: z.string().max(2000),
  note: z.string().trim().min(1, "이유를 적어 주세요.").max(500, "이유는 500자까지예요."),
});

/** 장소 · 행사 태그의 지도 위치 (운영자). 권한 · 감사 로그는 DB 함수가 맡는다. */
export async function setTagLocation(input: z.input<typeof locationSchema>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!isStaffRole(viewer?.profile?.role)) return { ok: false, error: "운영자만 바꿀 수 있어요." };

  const { tagId, location, note } = parsed.data;
  const point = location.trim() ? parseLatLng(location) : null;
  if (location.trim() && !point) return { ok: false, error: "좌표를 읽지 못했어요. '37.5665, 126.9780'처럼 넣거나 지도 주소를 붙여 넣어 주세요." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_tag_location", { target: tagId, new_lat: point?.lat ?? null, new_lng: point?.lng ?? null, note });
  if (error) return { ok: false, error: "저장하지 못했어요. 잠시 뒤 다시 해 주세요." };
  revalidatePath("/map");
  revalidatePath("/t/[slug]", "page");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isStaffRole } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { type PlaceResult, searchPlaces } from "@/lib/places/geocode";
import { parseLatLng } from "@/lib/places/location";
import { guideSchema } from "@/lib/places/guide";
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

const placeSearchSchema = z.string().trim().min(2, "두 글자 이상 넣어 주세요.").max(200, "200자까지 넣을 수 있어요.");

/** 주소 · 장소 이름으로 지도 위치 찾기 (운영자). 결과는 고르기만 하고, 저장은 setTagLocation이 한다. */
export async function findPlace(input: string): Promise<{ ok: true; query: string; results: PlaceResult[] } | { ok: false; error: string }> {
  const parsed = placeSearchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!isStaffRole(viewer?.profile?.role)) return { ok: false, error: "운영자만 쓸 수 있어요." };
  try {
    return { ok: true, ...(await searchPlaces(parsed.data)) };
  } catch {
    return { ok: false, error: "지도 검색이 응답하지 않아요. 잠시 뒤 다시 해 주세요." };
  }
}

const mergeSchema = z.object({
  sourceId: z.uuid(),
  targetId: z.uuid("남길 태그를 골라 주세요."),
  note: z.string().trim().min(1, "이유를 적어 주세요.").max(500, "이유는 500자까지예요."),
});

const MERGE_ERRORS: Record<string, string> = {
  admin_only: "최고 관리자만 합칠 수 있어요. (2단계 인증 필요)",
  same_tag: "같은 태그끼리는 합칠 수 없어요.",
  kind_mismatch: "종류가 같은 태그끼리만 합칠 수 있어요.",
  target_not_official: "남길 태그는 공식 태그여야 해요.",
  target_is_child: "이 태그 아래에 있는 캐릭터로는 합칠 수 없어요.",
  event_conflict: "두 태그 모두 행사에 이어져 있어요. 행사 하나를 먼저 정리해 주세요.",
  not_found: "태그를 찾지 못했어요. 새로 고침 해 주세요.",
};

/** 중복 태그 합치기 (최고 관리자). 이 태그를 없애고 고른 태그로 옮긴다. 권한 · 감사 로그는 DB 함수가 맡는다. */
export async function mergeTags(input: z.input<typeof mergeSchema>): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (viewer?.profile?.role !== "admin") return { ok: false, error: MERGE_ERRORS.admin_only };

  const { sourceId, targetId, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_tags", { source: sourceId, target: targetId, note });
  if (error) {
    const code = Object.keys(MERGE_ERRORS).find((k) => error.message.includes(k));
    return { ok: false, error: code ? MERGE_ERRORS[code]! : "합치지 못했어요. 잠시 뒤 다시 해 주세요." };
  }
  const { data: target } = await supabase.from("tags").select("slug").eq("id", targetId).single();
  revalidatePath("/t/[slug]", "page");
  revalidatePath("/map");
  revalidatePath("/explore");
  return { ok: true, slug: target?.slug ?? "" };
}

const guideInput = z.object({ tagId: z.uuid(), guide: guideSchema });

/** 촬영지 가이드 저장 (운영자). 모두 비우면 지운다. 권한 · 감사 로그는 DB 함수가 맡는다. */
export async function savePlaceGuide(input: z.input<typeof guideInput>): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = guideInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!isStaffRole(viewer?.profile?.role)) return { ok: false, error: "운영자만 적을 수 있어요." };
  const { tagId, guide } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_place_guide", {
    target: tagId,
    best_time: guide.bestTime,
    fee: guide.fee,
    tripod: guide.tripod,
    parking: guide.parking,
    tip: guide.tip,
  });
  if (error) return { ok: false, error: error.message.includes("not_official_place") ? "공식 장소 태그에만 적을 수 있어요." : "저장하지 못했어요. (2단계 인증이 필요해요)" };
  revalidatePath("/t/[slug]", "page");
  return { ok: true };
}

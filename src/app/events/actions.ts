"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { eventErrorMessage, eventSchema } from "@/lib/events/input";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

const attendSchema = z.object({
  eventId: z.uuid(),
  attending: z.boolean(),
  isPublic: z.boolean().default(false),
  cosNote: z.string().trim().max(100, "코스 메모는 100자까지예요.").default(""),
});

/** 참가 예정 표시 · 고치기 · 취소 (S-12 ②). 끝난 행사 · 정지 중은 DB가 막는다. */
export async function setAttendance(input: z.input<typeof attendSchema>): Promise<Result> {
  const parsed = attendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { eventId, attending, isPublic, cosNote } = parsed.data;
  const supabase = await createClient();
  let error;
  if (!attending) {
    ({ error } = await supabase.from("event_attendees").delete().eq("event_id", eventId).eq("user_id", viewer.id));
  } else {
    // 이미 표시했으면 고치고, 아니면 새로 (upsert는 키 열 수정 권한이 필요해 쓰지 않는다)
    const updated = await supabase
      .from("event_attendees")
      .update({ is_public: isPublic, cos_note: cosNote })
      .eq("event_id", eventId)
      .eq("user_id", viewer.id)
      .select("event_id");
    error = updated.error;
    if (!error && !updated.data?.length) {
      ({ error } = await supabase.from("event_attendees").insert({ event_id: eventId, user_id: viewer.id, is_public: isPublic, cos_note: cosNote }));
    }
  }
  if (error) {
    if (error.message.includes("attend_limit")) return { ok: false, error: "참가 예정은 200개까지 표시할 수 있어요." };
    if (error.message.includes("row-level security")) return { ok: false, error: "끝난 행사에는 참가 표시를 할 수 없어요." };
    return { ok: false, error: eventErrorMessage(error.message) };
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  return { ok: true };
}

/** 행사 등록 제안 (S-12 ①). 운영자가 승인하면 공식 행사가 된다. */
export async function proposeEvent(input: z.input<typeof eventSchema>): Promise<Result> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { name, startsOn, endsOn, venue, region, url, description } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({
    name,
    starts_on: startsOn,
    ends_on: endsOn,
    venue,
    region,
    url,
    description,
    proposed_by: viewer.id,
  });
  if (error) return { ok: false, error: eventErrorMessage(error.message) };
  revalidatePath("/events/propose");
  revalidatePath("/admin/events");
  return { ok: true };
}

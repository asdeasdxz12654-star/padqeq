"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { eventErrorMessage, eventSchema } from "@/lib/events/input";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

async function admin() {
  const viewer = await getViewer();
  return viewer?.profile?.role === "admin" ? createClient() : null;
}

const TAG_SLUG = /^[^\s/?#%\\&+.A-Z]{1,60}$/u;

/** 행사 등록 · 고치기 · 제안 승인 (target이 null이면 새로) */
export async function saveEventAdmin(target: string | null, input: z.input<typeof eventSchema> & { tagSlug: string }): Promise<Result> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  if (target !== null && !z.uuid().safeParse(target).success) return { ok: false, error: "잘못된 요청이에요." };
  if (!TAG_SLUG.test(input.tagSlug)) return { ok: false, error: "태그 주소는 소문자로, 공백과 / ? # % \\ & + . 없이 60자까지예요." };
  const supabase = await admin();
  if (!supabase) return { ok: false, error: "운영자만 할 수 있어요." };

  const { name, startsOn, endsOn, venue, region, url, description } = parsed.data;
  const { error } = await supabase.rpc("save_event", {
    target,
    event_name: name,
    event_starts: startsOn,
    event_ends: endsOn,
    event_venue: venue,
    event_region: region,
    event_url: url,
    event_description: description,
    tag_slug: input.tagSlug,
  });
  if (error) return { ok: false, error: eventErrorMessage(error.message) };
  revalidatePath("/events");
  revalidatePath("/admin/events");
  revalidatePath("/community");
  return { ok: true };
}

export async function rejectEventAdmin(id: string, note: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "잘못된 요청이에요." };
  const trimmed = note.trim();
  if (!trimmed || trimmed.length > 300) return { ok: false, error: "사유를 300자 안으로 적어 주세요." };
  const supabase = await admin();
  if (!supabase) return { ok: false, error: "운영자만 할 수 있어요." };
  const { error } = await supabase.rpc("reject_event", { target: id, note: trimmed });
  if (error) return { ok: false, error: "처리하지 못했어요." };
  revalidatePath("/admin/events");
  return { ok: true };
}

export async function deleteEventAdmin(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "잘못된 요청이에요." };
  const supabase = await admin();
  if (!supabase) return { ok: false, error: "운영자만 할 수 있어요." };
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) return { ok: false, error: "지우지 못했어요." };
  revalidatePath("/events");
  revalidatePath("/admin/events");
  return { ok: true };
}

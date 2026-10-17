import "server-only";
import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type EventRow = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  venue: string;
  region: string;
  url: string | null;
  description: string;
  status: "official" | "proposed" | "rejected";
  tag_id: string | null;
  place_tag_id: string | null;
  review_note: string | null;
};

const EVENT_COLUMNS = "id, name, starts_on, ends_on, venue, region, url, description, status, tag_id, place_tag_id, review_note";

/** 기간과 겹치는 공식 행사 (시작일 순) */
export async function listEvents(from: string, to: string): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "official")
    .lte("starts_on", to)
    .gte("ends_on", from)
    .order("starts_on")
    .limit(300);
  if (error) throw error;
  return data;
}

/** 오늘 이후 끝나는 공식 행사 */
export async function upcomingEvents(today: string, limit: number): Promise<EventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "official")
    .gte("ends_on", today)
    .order("starts_on")
    .limit(limit);
  if (error) throw error;
  return data;
}

/** 행사 하나 (RLS: 공식 · 내 제안 · 운영자) */
export const getEvent = cache(async (id: string): Promise<EventRow | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select(EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
});

/** 참가 예정 수 (비공개 포함, 누구인지는 모름) */
export async function attendeeCounts(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("event_attendee_counts", { ids: ids.slice(0, 200) });
  if (error) throw error;
  return new Map(data.map((r) => [r.event_id, r.attendees]));
}

/** 내가 참가 표시한 행사 */
export async function myAttendance(userId: string, ids?: string[]): Promise<Map<string, { isPublic: boolean; cosNote: string }>> {
  const supabase = await createClient();
  let query = supabase.from("event_attendees").select("event_id, is_public, cos_note").eq("user_id", userId);
  if (ids) {
    if (!ids.length) return new Map();
    query = query.in("event_id", ids.slice(0, 300));
  }
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return new Map(data.map((r) => [r.event_id, { isPublic: r.is_public, cosNote: r.cos_note }]));
}

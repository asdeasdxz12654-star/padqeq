import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { SiteSwitches } from "./labels";

const OFF: SiteSwitches = { readOnly: false, signupClosed: false, uploadsClosed: false, message: "", uploadStage: "solo" };

/** 긴급 스위치 (요청마다 한 번). 읽지 못하면 꺼진 것으로 본다 — 실제 차단은 DB 트리거가 한다. */
export const getSiteSwitches = cache(async (): Promise<SiteSwitches> => {
  const supabase = await createClient();
  const { data } = await supabase.from("site_switches").select("read_only, signup_closed, uploads_closed, message, upload_stage").maybeSingle();
  if (!data) return OFF;
  return {
    readOnly: data.read_only,
    signupClosed: data.signup_closed,
    uploadsClosed: data.uploads_closed,
    message: data.message,
    uploadStage: data.upload_stage,
  };
});

/** 24시간 안에 시작하는 점검 공지 (가장 가까운 것) */
export const getUpcomingMaintenance = cache(async () => {
  const supabase = await createClient();
  const now = new Date();
  const { data } = await supabase
    .from("notices")
    .select("id, title, maintenance_at")
    .eq("category", "maintenance")
    .gt("maintenance_at", now.toISOString())
    .lte("maintenance_at", new Date(now.getTime() + 24 * 3_600_000).toISOString())
    .order("maintenance_at")
    .limit(1)
    .maybeSingle();
  return data;
});

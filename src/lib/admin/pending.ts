import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type AdminPending = {
  reports: number;
  appeals: number;
  comments: number;
  board: number;
  messages: number;
  inquiries: number;
  events: number;
  total: number;
};

/** 운영자가 처리할 일 (운영자만 부른다. RLS상 운영자는 모두 본다). 한 요청 안에서는 한 번만. */
export const getAdminPending = cache(async (): Promise<AdminPending> => {
  const supabase = await createClient();
  const count = (table: "reports" | "appeals" | "comment_reports" | "board_reports" | "message_reports" | "inquiries") =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("status", "open").then((r) => r.count ?? 0);
  const [reports, appeals, comments, board, messages, inquiries, events] = await Promise.all([
    count("reports"),
    count("appeals"),
    count("comment_reports"),
    count("board_reports"),
    count("message_reports"),
    count("inquiries"),
    supabase.from("events").select("id", { count: "exact", head: true }).eq("status", "proposed").then((r) => r.count ?? 0),
  ]);
  return { reports, appeals, comments, board, messages, inquiries, events, total: reports + appeals + comments + board + messages + inquiries + events };
});

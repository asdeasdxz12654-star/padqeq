import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { creditSchema } from "./credit-input";
import type { z } from "zod";

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Credit = z.output<typeof creditSchema>;

/**
 * 크레딧을 게시물에 붙인다 (업로드 · 편집 공용).
 * 회원은 승인 요청(pending), 미가입자는 이름 · 링크로 바로 표시(external), 나 자신은 바로 승인.
 * 게시된 글이면 요청받은 회원에게 알림이 간다 (DB 트리거).
 */
export async function insertCredits(
  supabase: Supabase,
  postId: string,
  viewerId: string,
  credits: Credit[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!credits.length) return { ok: true };

  const handles = [...new Set(credits.flatMap((c) => (c.kind === "member" ? [c.handle] : [])))];
  const { data: members } = handles.length
    ? await supabase.from("profiles").select("id, handle").in("handle", handles)
    : { data: [] };
  const idOf = new Map((members ?? []).map((m) => [String(m.handle).toLowerCase(), m.id]));
  const missing = handles.find((h) => !idOf.has(h));
  if (missing) return { ok: false, error: `@${missing} 회원을 찾을 수 없어요.` };

  const rows = credits.map((c) =>
    c.kind === "member"
      ? { post_id: postId, role: c.role, member_id: idOf.get(c.handle)!, status: "pending" as const }
      : { post_id: postId, role: c.role, external_label: c.label, external_url: c.url, status: "external" as const },
  );
  const { error } = await supabase.from("credits").insert(rows);
  if (error) return { ok: false, error: "크레딧을 저장하지 못했어요." };

  if (rows.some((r) => "member_id" in r && r.member_id === viewerId)) {
    // 당사자 승인 규칙(RLS)대로 내 크레딧은 내가 승인한다
    await supabase.from("credits").update({ status: "approved" }).eq("post_id", postId).eq("member_id", viewerId).eq("status", "pending");
  }
  return { ok: true };
}

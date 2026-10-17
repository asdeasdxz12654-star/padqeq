import "server-only";
import { createClient } from "@/lib/supabase/server";
import { INQUIRY_CATEGORY_LABEL } from "@/lib/support/labels";
import { isUrgent, REASON_LABEL, type ReportReason } from "@/lib/moderation/reasons";
import { type InboxItem, rankInbox, type RankedItem } from "./inbox-rank";

const LIMIT = 200;
const clip = (s: string | null | undefined, n = 60) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const reasonTitle = (r: string) => REASON_LABEL[r as ReportReason]?.title ?? r;

type Named = { handle: string } | null;

/**
 * 처리함: 지금 처리할 일을 모두 모아 급한 순서로 (처리는 원래 화면에서).
 * 운영 도우미는 게시물 · 댓글 · 게시판 신고만 (신고 화면과 같은 범위). 실제 권한은 RLS가 다시 막는다.
 */
export async function loadInbox(isAdmin: boolean): Promise<RankedItem[]> {
  const supabase = await createClient();
  const none = Promise.resolve({ data: [] as never[], error: null });

  const [reports, comments, board, appeals, messages, inquiries, claims, events, tags] = await Promise.all([
    supabase
      .from("reports")
      .select("id, reason, created_at, post:posts!reports_post_id_fkey(id, title)")
      .eq("status", "open")
      .order("created_at")
      .limit(500),
    supabase
      .from("comment_reports")
      .select("id, reason, created_at, comment:comments!comment_reports_comment_id_fkey(id, body)")
      .eq("status", "open")
      .order("created_at")
      .limit(LIMIT),
    supabase
      .from("board_reports")
      .select(
        "id, reason, created_at, post:board_posts!board_reports_board_post_id_fkey(id, title), reply:board_replies!board_reports_reply_id_fkey(id, body)",
      )
      .eq("status", "open")
      .order("created_at")
      .limit(LIMIT),
    isAdmin
      ? supabase.from("appeals").select("id, statement, created_at, post:posts!appeals_post_id_fkey(title)").eq("status", "open").order("created_at").limit(LIMIT)
      : none,
    isAdmin
      ? supabase
          .from("message_reports")
          .select("id, reason, created_at, reported:profiles!message_reports_reported_id_fkey(handle)")
          .eq("status", "open")
          .order("created_at")
          .limit(LIMIT)
      : none,
    isAdmin
      ? supabase
          .from("inquiries")
          .select("id, category, body, created_at, author:profiles!inquiries_author_id_fkey(handle)")
          .eq("status", "open")
          .order("created_at")
          .limit(LIMIT)
      : none,
    isAdmin
      ? supabase
          .from("credit_claims")
          .select("id, created_at, claimant:profiles!credit_claims_claimant_id_fkey(handle), credit:credits!credit_claims_credit_id_fkey(external_label)")
          .eq("status", "open")
          .order("created_at")
          .limit(LIMIT)
      : none,
    isAdmin ? supabase.from("events").select("id, name, created_at").eq("status", "proposed").order("created_at").limit(LIMIT) : none,
    isAdmin ? supabase.from("tags").select("id, name, created_at").eq("status", "pending").order("created_at").limit(LIMIT) : none,
  ]);
  for (const r of [reports, comments, board, appeals, messages, inquiries, claims, events, tags]) if (r.error) throw r.error;

  const items: InboxItem[] = [];

  // 게시물 신고는 게시물마다 한 줄 (가장 오래된 신고 시각 · 급한 사유가 하나라도 있으면 긴급)
  type ReportRow = { id: string; reason: ReportReason; created_at: string; post: { id: string; title: string } | null };
  const byPost = Map.groupBy((reports.data as unknown as ReportRow[]).filter((r) => r.post), (r) => r.post!.id);
  for (const [postId, rows] of byPost) {
    const reasons = [...new Set(rows.map((r) => reasonTitle(r.reason)))];
    items.push({
      key: `report-${postId}`,
      kind: "report",
      title: clip(rows[0]!.post!.title) || "(제목 없음)",
      sub: `${reasons.join(" · ")}${rows.length > 1 ? ` · 신고 ${rows.length}건` : ""}`,
      at: rows[0]!.created_at,
      href: `/admin/reports?post=${postId}`,
      urgent: rows.some((r) => isUrgent(r.reason)),
    });
  }

  for (const r of comments.data as unknown as { id: string; reason: ReportReason; created_at: string; comment: { body: string } | null }[])
    items.push({
      key: `comment-${r.id}`,
      kind: "comment",
      title: clip(r.comment?.body) || "(지워진 댓글)",
      sub: reasonTitle(r.reason),
      at: r.created_at,
      href: "/admin/reports?tab=comments",
      urgent: isUrgent(r.reason),
    });

  for (const r of board.data as unknown as {
    id: string;
    reason: ReportReason;
    created_at: string;
    post: { title: string } | null;
    reply: { body: string } | null;
  }[])
    items.push({
      key: `board-${r.id}`,
      kind: "board",
      title: clip(r.reply ? r.reply.body : r.post?.title) || "(지워진 글)",
      sub: `${r.reply ? "답글 · " : ""}${reasonTitle(r.reason)}`,
      at: r.created_at,
      href: "/admin/reports?tab=board",
      urgent: isUrgent(r.reason),
    });

  for (const a of appeals.data as unknown as { id: string; statement: string; created_at: string; post: { title: string } | null }[])
    items.push({
      key: `appeal-${a.id}`,
      kind: "appeal",
      title: clip(a.post?.title) || "(지워진 게시물)",
      sub: clip(a.statement, 40),
      at: a.created_at,
      href: `/admin/reports?tab=appeals&appeal=${a.id}`,
      urgent: false,
    });

  for (const m of messages.data as unknown as { id: string; reason: ReportReason; created_at: string; reported: Named }[])
    items.push({
      key: `message-${m.id}`,
      kind: "message",
      title: m.reported ? `@${m.reported.handle}` : "탈퇴한 회원",
      sub: reasonTitle(m.reason),
      at: m.created_at,
      href: "/admin/reports?tab=messages",
      urgent: isUrgent(m.reason),
    });

  for (const q of inquiries.data as unknown as { id: string; category: keyof typeof INQUIRY_CATEGORY_LABEL; body: string; created_at: string; author: Named }[])
    items.push({
      key: `inquiry-${q.id}`,
      kind: "inquiry",
      title: clip(q.body),
      sub: `${INQUIRY_CATEGORY_LABEL[q.category] ?? "문의"} · ${q.author ? `@${q.author.handle}` : "탈퇴한 회원"}`,
      at: q.created_at,
      href: "/admin/support",
      urgent: false,
    });

  for (const c of claims.data as unknown as { id: string; created_at: string; claimant: Named; credit: { external_label: string | null } | null }[])
    items.push({
      key: `claim-${c.id}`,
      kind: "claim",
      title: `${c.claimant ? `@${c.claimant.handle}` : "탈퇴한 회원"} → ${c.credit?.external_label ?? "크레딧"}`,
      sub: "본인인지 확인하고 연결",
      at: c.created_at,
      href: "/admin/reports?tab=claims",
      urgent: false,
    });

  for (const e of events.data as unknown as { id: string; name: string; created_at: string }[])
    items.push({ key: `event-${e.id}`, kind: "event", title: e.name, sub: "승인하면 행사 태그가 생겨요", at: e.created_at, href: "/admin/events", urgent: false });

  for (const t of tags.data as unknown as { id: string; name: string; created_at: string }[])
    items.push({ key: `tag-${t.id}`, kind: "tag", title: t.name, sub: "회원이 만든 태그", at: t.created_at, href: "/admin/tags?view=pending", urgent: false });

  return rankInbox(items);
}

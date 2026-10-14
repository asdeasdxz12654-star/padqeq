import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

// 내 데이터 내려받기 (S-14 ⑤ · 개인정보 열람 · 이동 요구)
// 원본 사진은 서버에 없다 (회원이 보관). 내 게시물 정보 · 크레딧 · 신고 · 소명 기록을 JSON으로.
export async function GET(request: Request) {
  // 다른 사이트가 끼워 넣은 요청에는 응답하지 않는다 (같은 사이트에서 연 링크 · 주소 직접 입력만)
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return new Response(null, { status: 403 });

  const viewer = await getViewer();
  if (!viewer?.profile) return new Response("로그인이 필요해요.", { status: 401 });

  const supabase = await createClient();
  const [{ data: claims }, profile, posts, credits, reports, appeals, creditClaims, comments, commentReports, inquiries, boardPosts, boardReplies, sentMessages, blocks, messageSetting, creator, attending, proposedEvents] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("handle, display_name, bio, created_at, deletion_requested_at").eq("id", viewer.id).single(),
    supabase
      .from("posts")
      .select(
        `id, title, body, category, status, shot_year, shot_on, has_people, published_at, created_at, updated_at,
         photos(position, width, height, alt_text, taken_at, created_at),
         post_tags(tag:tags(kind, name)),
         credits(role, status, external_label, external_url, member:profiles!credits_member_id_fkey(handle))`,
      )
      .eq("author_id", viewer.id)
      .order("created_at"),
    supabase.from("credits").select("role, status, created_at, post:posts!credits_post_id_fkey(id, title)").eq("member_id", viewer.id),
    supabase.from("reports").select("reason, detail, status, created_at, resolved_at, post_id, evidence:report_evidence(content_type, bytes, uploaded_at)").eq("reporter_id", viewer.id),
    supabase.from("appeals").select("post_id, statement, status, created_at, resolved_at").eq("author_id", viewer.id),
    supabase.from("credit_claims").select("credit_id, note, status, created_at, resolved_at").eq("claimant_id", viewer.id),
    supabase.from("comments").select("post_id, parent_id, body, created_at, edited_at").eq("author_id", viewer.id).order("created_at"),
    supabase.from("comment_reports").select("comment_id, reason, detail, status, created_at, resolved_at").eq("reporter_id", viewer.id),
    supabase.from("inquiries").select("category, body, status, answer, created_at, answered_at").eq("author_id", viewer.id),
    supabase.from("board_posts").select("id, board, title, body, region, casting_kind, casting_terms, shoot_on, closed_at, created_at, edited_at").eq("author_id", viewer.id),
    supabase.from("board_replies").select("board_post_id, body, created_at, edited_at").eq("author_id", viewer.id),
    supabase.from("messages").select("thread_id, body, form, created_at").eq("sender_id", viewer.id).order("id").limit(10000),
    supabase.from("blocks").select("created_at, blocked:profiles!blocks_blocked_id_fkey(handle)").eq("blocker_id", viewer.id),
    supabase.from("message_settings").select("receive").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("creator_profiles").select("listed, roles, region, active_since, works, casting_open, updated_at").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("event_attendees").select("is_public, cos_note, created_at, event:events!event_attendees_event_id_fkey(name, starts_on)").eq("user_id", viewer.id),
    supabase.from("events").select("name, starts_on, ends_on, venue, region, status, created_at").eq("proposed_by", viewer.id),
  ]);
  if (profile.error || posts.error) return new Response("데이터를 모으지 못했어요.", { status: 500 });

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify(
    {
      service: "해담",
      exported_at: exportedAt,
      note: "원본 사진 파일은 서버에 저장하지 않아요. 게시된 사진은 화면 보기 전용 변환본만 있어요.",
      account: {
        ...profile.data,
        email: typeof claims?.claims.email === "string" ? claims.claims.email : null,
        login: "google",
      },
      posts: posts.data,
      credited_in: credits.data ?? [],
      reports_filed: reports.data ?? [],
      appeals_filed: appeals.data ?? [],
      credit_claims_filed: creditClaims.data ?? [],
      comments: comments.data ?? [],
      comment_reports_filed: commentReports.data ?? [],
      inquiries: inquiries.data ?? [],
      board_posts: boardPosts.data ?? [],
      board_replies: boardReplies.data ?? [],
      messages_sent: sentMessages.data ?? [],
      message_settings: messageSetting.data ?? { receive: "everyone" },
      blocked: blocks.data ?? [],
      creator_profile: creator.data,
      events_attending: attending.data ?? [],
      events_proposed: proposedEvents.data ?? [],
      restriction: viewer.restriction,
    },
    null,
    2,
  );

  const day = exportedAt.slice(0, 10).replaceAll("-", "");
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="haedam-${viewer.profile.handle}-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}

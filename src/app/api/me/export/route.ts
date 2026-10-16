import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";

// 내 데이터 내려받기 (S-14 ⑤ · 개인정보 열람 · 이동 요구)
// 원본 사진은 서버에 없다 (회원이 보관). 내 게시물 정보 · 크레딧 · 신고 · 소명 기록 등을 JSON으로.
// 많아질 수 있는 목록(게시물 · 댓글 · 좋아요 · 저장 · 메시지)은 1000개씩 끝까지 나눠 받는다 (DB 한 번 응답 상한).

const CHUNK = 1000;
const MAX_ROWS = 100_000;

/** 한 번에 1000행까지만 오므로 끝까지 이어 받는다 */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += CHUNK) {
    const { data, error } = await page(from, from + CHUNK - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < CHUNK) break;
  }
  return rows;
}

export async function GET(request: Request) {
  // 다른 사이트가 끼워 넣은 요청에는 응답하지 않는다 (같은 사이트에서 연 링크 · 주소 직접 입력만)
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") return new Response(null, { status: 403 });

  const viewer = await getViewer();
  if (!viewer?.profile) return new Response("로그인이 필요해요.", { status: 401 });

  const supabase = await createClient();
  const uid = viewer.id;
  let lists;
  try {
    lists = await Promise.all([
      fetchAll((a, b) =>
        supabase
          .from("posts")
          .select(
            `id, title, body, category, status, shot_year, shot_on, has_people, visibility, comment_policy, veil, published_at, created_at, updated_at,
             photos(position, width, height, alt_text, taken_at, created_at),
             post_tags(tag:tags(kind, name)),
             credits(role, status, external_label, external_url, member:profiles!credits_member_id_fkey(handle))`,
          )
          .eq("author_id", uid)
          .order("created_at")
          .range(a, b),
      ),
      fetchAll((a, b) => supabase.from("comments").select("post_id, parent_id, body, created_at, edited_at").eq("author_id", uid).order("created_at").range(a, b)),
      fetchAll((a, b) => supabase.from("post_likes").select("post_id, created_at").eq("user_id", uid).order("created_at").range(a, b)),
      fetchAll((a, b) => supabase.from("bookmarks").select("post_id, created_at").eq("user_id", uid).order("created_at").range(a, b)),
      fetchAll((a, b) => supabase.from("messages").select("thread_id, body, form, created_at").eq("sender_id", uid).order("id").range(a, b)),
    ]);
  } catch {
    return new Response("데이터를 모으지 못했어요.", { status: 500 });
  }
  const [posts, comments, likes, bookmarks, sentMessages] = lists;
  const [{ data: claims }, profile, settings, credits, reports, appeals, creditClaims, commentReports, inquiries, boardPosts, boardReplies, blocks, messageSetting, creator, attending, proposedEvents, collections, tagFollows, memberFollows, warnings] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("profiles").select("handle, display_name, bio, links, created_at, deletion_requested_at").eq("id", viewer.id).single(),
    supabase.rpc("my_settings").maybeSingle(),
    supabase.from("credits").select("role, status, created_at, post:posts!credits_post_id_fkey(id, title)").eq("member_id", viewer.id),
    supabase.from("reports").select("reason, detail, status, created_at, resolved_at, post_id, evidence:report_evidence(content_type, bytes, uploaded_at)").eq("reporter_id", viewer.id),
    supabase.from("appeals").select("post_id, statement, status, created_at, resolved_at").eq("author_id", viewer.id),
    supabase.from("credit_claims").select("credit_id, note, status, created_at, resolved_at").eq("claimant_id", viewer.id),
    supabase.from("comment_reports").select("comment_id, reason, detail, status, created_at, resolved_at").eq("reporter_id", viewer.id),
    supabase.from("inquiries").select("category, body, status, answer, created_at, answered_at").eq("author_id", viewer.id),
    supabase.from("board_posts").select("id, board, title, body, region, casting_kind, casting_terms, shoot_on, closed_at, created_at, edited_at").eq("author_id", viewer.id),
    supabase.from("board_replies").select("board_post_id, body, created_at, edited_at").eq("author_id", viewer.id),
    supabase.from("blocks").select("created_at, blocked:profiles!blocks_blocked_id_fkey(handle)").eq("blocker_id", viewer.id),
    supabase.from("message_settings").select("receive").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("creator_profiles").select("listed, roles, region, active_since, works, casting_open, updated_at").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("event_attendees").select("is_public, cos_note, created_at, event:events!event_attendees_event_id_fkey(name, starts_on)").eq("user_id", viewer.id),
    supabase.from("events").select("name, starts_on, ends_on, venue, region, status, created_at").eq("proposed_by", viewer.id),
    supabase.from("collections").select("title, description, is_public, created_at, updated_at, posts:collection_posts(post_id, added_at)").eq("owner_id", viewer.id),
    supabase.from("tag_follows").select("created_at, tag:tags(kind, name)").eq("user_id", viewer.id),
    supabase.from("member_follows").select("created_at, member:profiles!member_follows_followee_id_fkey(handle)").eq("follower_id", viewer.id),
    supabase.from("member_warnings").select("reason, created_at").eq("member_id", viewer.id),
  ]);
  if (profile.error || settings.error) return new Response("데이터를 모으지 못했어요.", { status: 500 });

  const exportedAt = new Date().toISOString();
  const body = JSON.stringify(
    {
      service: "해담",
      exported_at: exportedAt,
      note: "원본 사진 파일은 서버에 저장하지 않아요. 게시된 사진은 화면 보기 전용 변환본만 있어요.",
      account: {
        ...profile.data,
        ...settings.data,
        email: typeof claims?.claims.email === "string" ? claims.claims.email : null,
        login: "google",
      },
      posts,
      credited_in: credits.data ?? [],
      reports_filed: reports.data ?? [],
      appeals_filed: appeals.data ?? [],
      credit_claims_filed: creditClaims.data ?? [],
      comments,
      comment_reports_filed: commentReports.data ?? [],
      inquiries: inquiries.data ?? [],
      board_posts: boardPosts.data ?? [],
      board_replies: boardReplies.data ?? [],
      messages_sent: sentMessages,
      message_settings: messageSetting.data ?? { receive: "everyone" },
      blocked: blocks.data ?? [],
      creator_profile: creator.data,
      events_attending: attending.data ?? [],
      events_proposed: proposedEvents.data ?? [],
      likes_given: likes,
      saved: bookmarks,
      collections: collections.data ?? [],
      following_tags: tagFollows.data ?? [],
      following_members: memberFollows.data ?? [],
      warnings_received: warnings.data ?? [],
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

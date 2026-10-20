import type { Metadata } from "next";
import Link from "next/link";
import { REASON_LABEL, queueStatus, type ReportReason } from "@/lib/moderation/reasons";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { CommentDecisionForm } from "./comment-decision-form";
import { BoardDecisionForm, MessageReportPanel } from "./community-report-forms";
import { ClaimDecision } from "./claim-decision";
import { APPEAL_POST, AppealDetail, type AppealRow, REPORT_SELECT, ReportDetail, type ReportRow } from "./details";
import { KST } from "@/lib/format/kst";

export const metadata: Metadata = { title: "신고 처리" };

// A-04 신고 · 검수 처리 (신고 대기열 · 소명 · 처리 완료)
// 같은 게시물의 신고는 하나로 묶고, 가장 급한 사유 · 가장 오래된 접수 순으로 놓는다.

const timeFormat = KST.dateTimeShort;

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const params = await searchParams;
  // 운영 도우미: 게시물 · 댓글 · 게시판 신고만 (소명 · 대화 신고 · 크레딧 연결은 최고 관리자)
  const isAdmin = (await getViewer())?.profile?.role === "admin";
  const requested =
    params.tab === "done" ||
    params.tab === "appeals" ||
    params.tab === "comments" ||
    params.tab === "board" ||
    params.tab === "messages" ||
    params.tab === "claims"
      ? params.tab
      : "open";
  const tab = !isAdmin && (requested === "appeals" || requested === "messages" || requested === "claims") ? "open" : requested;
  const selected = typeof params.post === "string" ? params.post : null;
  const supabase = await createClient();

  // 운영자는 RLS상 모든 신고 · 게시물을 본다
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const open = data as unknown as ReportRow[];

  const groups = [...Map.groupBy(open.filter((r) => r.post), (r) => r.post!.id).values()]
    .map((reports) => ({ post: reports[0]!.post!, reports, status: queueStatus(reports) }))
    .sort(
      (a, b) =>
        Number(b.status.urgent) - Number(a.status.urgent) ||
        Number(b.status.overdue) - Number(a.status.overdue) ||
        b.status.elapsedHours - a.status.elapsedHours,
    );

  const done =
    tab === "done"
      ? (((
          await supabase
            .from("reports")
            .select(REPORT_SELECT)
            .neq("status", "open")
            .order("resolved_at", { ascending: false })
            .limit(50)
        ).data ?? []) as unknown as ReportRow[])
      : [];

  const current = selected ? groups.find((g) => g.post.id === selected) ?? null : null;

  // 소명: 검토 대기 (오래된 순)
  const { data: appealRows, error: appealError } = await supabase
    .from("appeals")
    .select(`id, statement, created_at, ${APPEAL_POST}`)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(200);
  if (appealError) throw appealError;
  const appeals = appealRows as unknown as AppealRow[];
  const selectedAppeal = typeof params.appeal === "string" ? appeals.find((a) => a.id === params.appeal) ?? null : null;

  // 댓글 신고: 댓글별로 묶어 오래된 순
  const { data: commentRows, error: commentError } = await supabase
    .from("comment_reports")
    .select(COMMENT_REPORT_SELECT)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(500);
  if (commentError) throw commentError;
  const commentGroups = [
    ...Map.groupBy(
      (commentRows as unknown as CommentReportRow[]).filter((r) => r.comment),
      (r) => r.comment!.id,
    ).values(),
  ].map((reports) => ({ comment: reports[0]!.comment!, reports }));

  // 게시판 신고: 글 · 답글별로 묶어 오래된 순 / 메시지 신고: 대화별
  const [{ data: boardRows, error: boardError }, { data: messageRows, error: messageError }] = await Promise.all([
    supabase
      .from("board_reports")
      .select(BOARD_REPORT_SELECT)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("message_reports")
      .select("id, reason, detail, created_at, reporter:profiles!message_reports_reporter_id_fkey(handle), reported:profiles!message_reports_reported_id_fkey(id, handle)")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(200),
  ]);
  if (boardError || messageError) throw boardError ?? messageError;

  // 크레딧 연결 요청 (S-19 ②): 운영자가 본인인지 확인한다
  const { data: claimRows, error: claimError } = await supabase
    .from("credit_claims")
    .select(
      "id, note, created_at, claimant:profiles!credit_claims_claimant_id_fkey(id, handle, display_name, bio), credit:credits!credit_claims_credit_id_fkey(role, external_label, external_url, post:posts!credits_post_id_fkey(id, title, author:profiles!posts_author_id_fkey(handle)))",
    )
    .eq("status", "open")
    .order("created_at")
    .limit(200);
  if (claimError) throw claimError;
  const claims = claimRows;
  const boardGroups = [
    ...Map.groupBy(boardRows as unknown as BoardReportRow[], (r) => r.reply?.id ?? r.post?.id ?? r.id).values(),
  ].map((reports) => ({ post: reports[0]!.post, reply: reports[0]!.reply, reports }));
  const messageReports = messageRows;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">신고 처리</h1>
        <nav aria-label="신고 보기" className="flex gap-2 text-sm">
          <Link
            href="/admin/reports"
            aria-current={tab === "open" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            대기 {groups.length}
          </Link>
          <Link
            href="/admin/reports?tab=done"
            aria-current={tab === "done" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            처리 완료
          </Link>
          {isAdmin && (
            <Link
              href="/admin/reports?tab=appeals"
              aria-current={tab === "appeals" ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              소명 {appeals.length}
            </Link>
          )}
          <Link
            href="/admin/reports?tab=comments"
            aria-current={tab === "comments" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            댓글 {commentGroups.length}
          </Link>
          <Link
            href="/admin/reports?tab=board"
            aria-current={tab === "board" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            게시판 {boardGroups.length}
          </Link>
          {isAdmin && (
            <Link
              href="/admin/reports?tab=messages"
              aria-current={tab === "messages" ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              메시지 {messageReports.length}
            </Link>
          )}
          {isAdmin && (
            <Link
              href="/admin/reports?tab=claims"
              aria-current={tab === "claims" ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              크레딧 연결 {claims.length}
            </Link>
          )}
        </nav>
      </header>

      {tab === "open" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section aria-label="대기열">
            {groups.length === 0 ? (
              <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">처리할 신고가 없어요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.map(({ post, reports, status }) => (
                  <li key={post.id}>
                    <Link
                      href={`/admin/reports?post=${post.id}`}
                      aria-current={selected === post.id ? "true" : undefined}
                      className="flex flex-col gap-1 rounded-xl border border-line p-3 hover:border-quiet aria-[current=true]:border-accent"
                    >
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${status.urgent ? "bg-danger-soft text-danger" : "bg-slot text-quiet"}`}>
                          {status.urgent ? "최우선" : "일반"}
                        </span>
                        <span className="text-quiet">{REASON_LABEL[reports[0]!.reason].title}</span>
                        {post.held_at && <span className="text-warn">임시 비공개</span>}
                      </span>
                      <span className="truncate font-medium">{post.title}</span>
                      <span className={`text-xs ${status.overdue ? "font-semibold text-danger" : "text-quiet"}`}>
                        신고 {reports.length}건 · 접수 {Math.floor(status.elapsedHours)}시간 경과 · 목표 {status.targetHours}시간
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="처리" className="flex flex-col gap-5">
            {current ? <ReportDetail group={current} /> : <p className="text-sm text-quiet">왼쪽에서 신고를 고르세요.</p>}
          </section>
        </div>
      ) : tab === "comments" ? (
        <CommentReports groups={commentGroups} />
      ) : tab === "claims" ? (
        <ul className="flex max-w-3xl flex-col gap-4">
          {claims.length === 0 && <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">확인할 연결 요청이 없어요.</p>}
          {claims.map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-line p-4 text-sm">
              <p>
                {c.credit?.post ? (
                  <Link href={`/p/${c.credit.post.id}`} className="font-semibold hover:underline">
                    {c.credit.post.title}
                  </Link>
                ) : (
                  "(지워진 글)"
                )}
                <span className="text-xs text-quiet"> · 업로더 @{c.credit?.post?.author?.handle ?? "?"} · {timeFormat.format(new Date(c.created_at))}</span>
              </p>
              <p>
                미가입 표기 &lsquo;{c.credit?.external_label}&rsquo;
                {c.credit?.external_url && (
                  <a href={c.credit.external_url} target="_blank" rel="noopener noreferrer nofollow" className="ml-1 text-xs underline underline-offset-2">
                    {c.credit.external_url}
                  </a>
                )}
                {" → "}
                {c.claimant && (
                  <Link href={`/admin/members/${c.claimant.id}`} className="font-semibold hover:underline">
                    @{c.claimant.handle}
                  </Link>
                )}
              </p>
              {c.claimant?.bio && <p className="rounded-lg bg-slot p-2 text-xs whitespace-pre-line text-quiet">프로필 소개: {c.claimant.bio}</p>}
              {c.note && <p className="text-xs">요청 메모: &ldquo;{c.note}&rdquo;</p>}
              <p className="text-xs text-quiet">표기된 SNS 계정과 같은 사람인지 확인해 주세요 (예: 그 SNS에 해담 핸들을 잠시 올려 달라고 1:1 문의로 요청).</p>
              <ClaimDecision claimId={c.id} />
            </li>
          ))}
        </ul>
      ) : tab === "board" ? (
        <BoardReports groups={boardGroups} />
      ) : tab === "messages" ? (
        <ul className="flex max-w-3xl flex-col gap-4">
          {messageReports.length === 0 && <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">처리할 메시지 신고가 없어요.</p>}
          {messageReports.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 text-sm">
              <p className="flex flex-wrap gap-x-3 text-xs text-quiet">
                <span className="font-semibold text-text">{REASON_LABEL[r.reason].title}</span>
                <span>신고 @{r.reporter?.handle ?? "?"}</span>
                {r.reported && (
                  <Link href={`/admin/members/${r.reported.id}`} className="hover:underline">
                    대상 @{r.reported.handle} · 회원 관리
                  </Link>
                )}
                <span>{timeFormat.format(new Date(r.created_at))}</span>
              </p>
              {r.detail && <p className="whitespace-pre-line">{r.detail}</p>}
              <MessageReportPanel reportId={r.id} />
            </li>
          ))}
        </ul>
      ) : tab === "appeals" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section aria-label="소명 대기열">
            {appeals.length === 0 ? (
              <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">검토할 소명이 없어요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {appeals.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/admin/reports?tab=appeals&appeal=${a.id}`}
                      aria-current={selectedAppeal?.id === a.id ? "true" : undefined}
                      className="flex flex-col gap-1 rounded-xl border border-line p-3 hover:border-quiet aria-[current=true]:border-accent"
                    >
                      <span className="text-xs text-warn">{a.post?.removed_at ? "게시 중단" : "임시 비공개"}</span>
                      <span className="truncate font-medium">{a.post?.title}</span>
                      <span className="text-xs text-quiet">
                        @{a.post?.author?.handle ?? "?"} · 접수 {timeFormat.format(new Date(a.created_at))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="소명 처리" className="flex flex-col gap-5">
            {selectedAppeal?.post ? (
              <AppealDetail appeal={selectedAppeal} post={selectedAppeal.post} />
            ) : (
              <p className="text-sm text-quiet">왼쪽에서 소명을 고르세요.</p>
            )}
          </section>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {done.length === 0 && <p className="text-sm text-quiet">처리한 신고가 아직 없어요.</p>}
          {done.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line p-3 text-sm">
              <span className={r.status === "dismissed" ? "text-quiet" : "text-ok"}>{r.status === "dismissed" ? "기각" : "조치"}</span>
              <span className="font-medium">{r.post?.title}</span>
              <span className="text-quiet">{REASON_LABEL[r.reason].title}</span>
              <span className="text-xs text-quiet">처리 {r.resolved_at ? timeFormat.format(new Date(r.resolved_at)) : "-"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CommentReportRow = {
  id: string;
  reason: ReportReason;
  detail: string;
  created_at: string;
  reporter: { handle: string } | null;
  comment: {
    id: string;
    body: string;
    hidden_at: string | null;
    created_at: string;
    author: { id: string; handle: string } | null;
    post: { id: string; title: string } | null;
  } | null;
};

const COMMENT_REPORT_SELECT = `id, reason, detail, created_at,
  reporter:profiles!comment_reports_reporter_id_fkey(handle),
  comment:comments!comment_reports_comment_id_fkey(id, body, hidden_at, created_at,
    author:profiles!comments_author_id_fkey(id, handle), post:posts!comments_post_id_fkey(id, title))`;

function CommentReports({ groups }: { groups: { comment: NonNullable<CommentReportRow["comment"]>; reports: CommentReportRow[] }[] }) {
  if (groups.length === 0) return <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">처리할 댓글 신고가 없어요.</p>;
  return (
    <ul className="flex max-w-3xl flex-col gap-4">
      {groups.map(({ comment, reports }) => (
        <li key={comment.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 text-sm">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet">
            {comment.hidden_at && <span className="text-warn">자동으로 가려짐</span>}
            {comment.author && (
              <Link href={`/admin/members/${comment.author.id}`} className="hover:underline">
                @{comment.author.handle} · 회원 관리
              </Link>
            )}
            {comment.post && (
              <Link href={`/p/${comment.post.id}#comments`} className="hover:underline">
                글: {comment.post.title}
              </Link>
            )}
            <span>{timeFormat.format(new Date(comment.created_at))}</span>
          </p>
          <blockquote className="rounded-lg bg-slot p-3 whitespace-pre-line">{comment.body}</blockquote>
          <ol className="flex flex-col gap-1 text-xs">
            {reports.map((r) => (
              <li key={r.id}>
                <span className="font-semibold">{REASON_LABEL[r.reason].title}</span>
                <span className="text-quiet"> · @{r.reporter?.handle ?? "?"} · {timeFormat.format(new Date(r.created_at))}</span>
                {r.detail && <span className="block whitespace-pre-line">{r.detail}</span>}
              </li>
            ))}
          </ol>
          <CommentDecisionForm commentId={comment.id} />
        </li>
      ))}
    </ul>
  );
}

type BoardReportRow = {
  id: string;
  reason: ReportReason;
  detail: string;
  created_at: string;
  reporter: { handle: string } | null;
  post: { id: string; title: string; body: string; hidden_at: string | null; author: { id: string; handle: string } | null } | null;
  reply: { id: string; body: string; hidden_at: string | null; author: { id: string; handle: string } | null } | null;
};

const BOARD_REPORT_SELECT = `id, reason, detail, created_at,
  reporter:profiles!board_reports_reporter_id_fkey(handle),
  post:board_posts!board_reports_board_post_id_fkey(id, title, body, hidden_at, author:profiles!board_posts_author_id_fkey(id, handle)),
  reply:board_replies!board_reports_reply_id_fkey(id, body, hidden_at, author:profiles!board_replies_author_id_fkey(id, handle))`;

function BoardReports({ groups }: { groups: { post: BoardReportRow["post"]; reply: BoardReportRow["reply"]; reports: BoardReportRow[] }[] }) {
  if (groups.length === 0) return <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">처리할 게시판 신고가 없어요.</p>;
  return (
    <ul className="flex max-w-3xl flex-col gap-4">
      {groups.map(({ post, reply, reports }) => {
        if (!post) return null;
        const target = reply ?? post;
        return (
          <li key={reply?.id ?? post.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 text-sm">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet">
              <span>{reply ? "답글" : "글"}</span>
              {target.hidden_at && <span className="text-warn">자동으로 가려짐</span>}
              {target.author && (
                <Link href={`/admin/members/${target.author.id}`} className="hover:underline">
                  @{target.author.handle} · 회원 관리
                </Link>
              )}
              <Link href={`/community/${post.id}`} className="hover:underline">
                글: {post.title}
              </Link>
            </p>
            <blockquote className="max-h-48 overflow-y-auto rounded-lg bg-slot p-3 whitespace-pre-line">{target.body}</blockquote>
            <ol className="flex flex-col gap-1 text-xs">
              {reports.map((r) => (
                <li key={r.id}>
                  <span className="font-semibold">{REASON_LABEL[r.reason].title}</span>
                  <span className="text-quiet"> · @{r.reporter?.handle ?? "?"} · {timeFormat.format(new Date(r.created_at))}</span>
                </li>
              ))}
            </ol>
            <BoardDecisionForm postId={post.id} replyId={reply?.id ?? null} />
          </li>
        );
      })}
    </ul>
  );
}

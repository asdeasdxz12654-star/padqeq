import Link from "next/link";
import { KST } from "@/lib/format/kst";
import { REASON_LABEL, type ReportReason } from "@/lib/moderation/reasons";
import { ClaimDecision } from "./claim-decision";
import { CommentDecisionForm } from "./comment-decision-form";
import { BoardDecisionForm, MessageReportPanel } from "./community-report-forms";

// 신고 · 요청 한 건씩의 처리 카드. 처리함(오른쪽 칸)과 처리한 기록 화면이 함께 쓴다.

const timeFormat = KST.dateTime;

export type CommentReportRow = {
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

export const COMMENT_REPORT_SELECT = `id, reason, detail, created_at,
  reporter:profiles!comment_reports_reporter_id_fkey(handle),
  comment:comments!comment_reports_comment_id_fkey(id, body, hidden_at, created_at,
    author:profiles!comments_author_id_fkey(id, handle), post:posts!comments_post_id_fkey(id, title))`;

export type BoardReportRow = {
  id: string;
  reason: ReportReason;
  detail: string;
  created_at: string;
  reporter: { handle: string } | null;
  post: { id: string; title: string; body: string; hidden_at: string | null; author: { id: string; handle: string } | null } | null;
  reply: { id: string; body: string; hidden_at: string | null; author: { id: string; handle: string } | null } | null;
};

export const BOARD_REPORT_SELECT = `id, reason, detail, created_at,
  reporter:profiles!board_reports_reporter_id_fkey(handle),
  post:board_posts!board_reports_board_post_id_fkey(id, title, body, hidden_at, author:profiles!board_posts_author_id_fkey(id, handle)),
  reply:board_replies!board_reports_reply_id_fkey(id, body, hidden_at, author:profiles!board_replies_author_id_fkey(id, handle))`;

export type MessageReportRow = {
  id: string;
  reason: ReportReason;
  detail: string;
  created_at: string;
  reporter: { handle: string } | null;
  reported: { id: string; handle: string } | null;
};

export const MESSAGE_REPORT_SELECT =
  "id, reason, detail, created_at, reporter:profiles!message_reports_reporter_id_fkey(handle), reported:profiles!message_reports_reported_id_fkey(id, handle)";

export type ClaimRow = {
  id: string;
  note: string | null;
  created_at: string;
  claimant: { id: string; handle: string; display_name: string; bio: string } | null;
  credit: {
    role: string;
    external_label: string | null;
    external_url: string | null;
    post: { id: string; title: string; author: { handle: string } | null } | null;
  } | null;
};

export const CLAIM_SELECT =
  "id, note, created_at, claimant:profiles!credit_claims_claimant_id_fkey(id, handle, display_name, bio), credit:credits!credit_claims_credit_id_fkey(role, external_label, external_url, post:posts!credits_post_id_fkey(id, title, author:profiles!posts_author_id_fkey(handle)))";

const card = "flex flex-col gap-3 rounded-xl border border-line p-4 text-sm";

/** 댓글 하나에 들어온 신고 */
export function CommentReportCard({ comment, reports }: { comment: NonNullable<CommentReportRow["comment"]>; reports: CommentReportRow[] }) {
  return (
    <div className={card}>
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
      <ReportReasons reports={reports} />
      <CommentDecisionForm commentId={comment.id} />
    </div>
  );
}

/** 게시판 글 · 답글 하나에 들어온 신고 */
export function BoardReportCard({ post, reply, reports }: { post: NonNullable<BoardReportRow["post"]>; reply: BoardReportRow["reply"]; reports: BoardReportRow[] }) {
  const target = reply ?? post;
  return (
    <div className={card}>
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
      <ReportReasons reports={reports} />
      <BoardDecisionForm postId={post.id} replyId={reply?.id ?? null} />
    </div>
  );
}

/** 메시지 신고 (대화는 열 때만 불러온다) */
export function MessageReportCard({ report }: { report: MessageReportRow }) {
  return (
    <div className={card}>
      <p className="flex flex-wrap gap-x-3 text-xs text-quiet">
        <span className="font-semibold text-text">{REASON_LABEL[report.reason].title}</span>
        <span>신고 @{report.reporter?.handle ?? "?"}</span>
        {report.reported && (
          <Link href={`/admin/members/${report.reported.id}`} className="hover:underline">
            대상 @{report.reported.handle} · 회원 관리
          </Link>
        )}
        <span>{timeFormat.format(new Date(report.created_at))}</span>
      </p>
      {report.detail && <p className="whitespace-pre-line">{report.detail}</p>}
      <MessageReportPanel reportId={report.id} />
    </div>
  );
}

/** 미가입 크레딧 연결 요청 (S-19 ②): 표기된 사람과 같은 회원인지 확인 */
export function ClaimCard({ claim: c }: { claim: ClaimRow }) {
  return (
    <div className={card}>
      <p>
        {c.credit?.post ? (
          <Link href={`/p/${c.credit.post.id}`} className="font-semibold hover:underline">
            {c.credit.post.title}
          </Link>
        ) : (
          "(지워진 글)"
        )}
        <span className="text-xs text-quiet">
          {" "}
          · 업로더 @{c.credit?.post?.author?.handle ?? "?"} · {timeFormat.format(new Date(c.created_at))}
        </span>
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
    </div>
  );
}

function ReportReasons({ reports }: { reports: { id: string; reason: ReportReason; detail: string; created_at: string; reporter: { handle: string } | null }[] }) {
  return (
    <ol className="flex flex-col gap-1 text-xs">
      {reports.map((r) => (
        <li key={r.id}>
          <span className="font-semibold">{REASON_LABEL[r.reason].title}</span>
          <span className="text-quiet">
            {" "}
            · @{r.reporter?.handle ?? "?"} · {timeFormat.format(new Date(r.created_at))}
          </span>
          {r.detail && <span className="block whitespace-pre-line">{r.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

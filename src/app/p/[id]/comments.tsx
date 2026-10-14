"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { COMMENT_MAX, COMMENT_REPORT_REASONS } from "@/lib/comments/input";
import type { CommentView } from "@/lib/comments/load";
import { splitMentions } from "@/lib/comments/mentions";
import { REASON_LABEL } from "@/lib/moderation/reasons";
import { profileHref } from "@/lib/profiles/profile-href";
import { addComment, deleteComment, editComment, pinComment, reportComment } from "./comment-actions";

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

type Ctx = {
  postId: string;
  viewerId: string | null;
  isPostAuthor: boolean;
  isAdmin: boolean;
  canWrite: boolean;
};

/** 댓글 (P-04): 답글 1단계 · @멘션 · 수정 · 삭제 · 신고 · 업로더 고정 1개 */
export function Comments({
  comments,
  count,
  loginHref,
  closedReason,
  ...ctx
}: Ctx & { comments: CommentView[]; count: number; loginHref: string; closedReason: string | null }) {
  return (
    <section id="comments" aria-labelledby="comments-heading" className="flex scroll-mt-20 flex-col gap-4">
      <h2 id="comments-heading" className="text-sm font-semibold">
        댓글 <span className="font-normal text-quiet">{count}</span>
      </h2>
      {ctx.canWrite ? (
        <CommentForm postId={ctx.postId} parentId={null} />
      ) : closedReason ? (
        <p className="text-sm text-quiet">{closedReason}</p>
      ) : (
        <Link href={loginHref} className="self-start text-sm text-quiet underline underline-offset-4">
          로그인하고 댓글 달기
        </Link>
      )}
      {comments.length > 0 && (
        <ul className="flex flex-col gap-4">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentItem comment={c} ctx={ctx} isTop />
              {c.replies.length > 0 && (
                <ul className="mt-3 ml-4 flex flex-col gap-3 border-l border-line pl-3">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <CommentItem comment={r} ctx={ctx} isTop={false} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentBody({ body }: { body: string }) {
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-line">
      {splitMentions(body).map((s, i) =>
        s.kind === "mention" ? (
          <Link key={i} href={profileHref(s.handle)} className="font-medium text-accent hover:underline">
            {s.text}
          </Link>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

type Mode = "idle" | "reply" | "edit" | "report";
const actionClass = "min-h-8 text-xs text-quiet hover:text-text disabled:opacity-50";

function CommentItem({ comment, ctx, isTop }: { comment: CommentView; ctx: Ctx; isTop: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const mine = ctx.viewerId === comment.author.id;
  const canDelete = mine || ctx.isPostAuthor || ctx.isAdmin;

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });

  return (
    <article aria-label={`@${comment.author.handle}의 댓글`} className="flex flex-col gap-1">
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-quiet">
        <Link href={profileHref(comment.author.handle)} className="font-semibold text-text hover:underline">
          @{comment.author.handle}
        </Link>
        <time dateTime={comment.createdAt}>{dateFormat.format(new Date(comment.createdAt))}</time>
        {comment.edited && <span>수정됨</span>}
        {comment.pinned && <span className="text-accent">고정</span>}
      </p>
      {comment.hidden ? (
        <p className="text-sm text-quiet">운영 정책에 따라 가려진 댓글이에요. 다른 사람에게는 보이지 않아요.</p>
      ) : mode === "edit" ? (
        <CommentForm postId={ctx.postId} parentId={null} editId={comment.id} initial={comment.body} onDone={() => setMode("idle")} />
      ) : (
        <CommentBody body={comment.body} />
      )}

      {mode !== "edit" && (
        <div className="flex flex-wrap gap-x-3">
          {ctx.canWrite && isTop && !comment.hidden && (
            <button type="button" className={actionClass} onClick={() => setMode(mode === "reply" ? "idle" : "reply")}>
              답글
            </button>
          )}
          {mine && ctx.canWrite && !comment.hidden && (
            <button type="button" className={actionClass} onClick={() => setMode("edit")}>
              수정
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              disabled={pending}
              className={actionClass}
              onClick={() => {
                const warn = comment.replies.length ? " 답글도 함께 지워져요." : "";
                if (window.confirm(`이 댓글을 지울까요?${warn}`)) run(() => deleteComment({ postId: ctx.postId, id: comment.id }));
              }}
            >
              삭제
            </button>
          )}
          {ctx.isPostAuthor && isTop && !comment.hidden && (
            <button
              type="button"
              disabled={pending}
              className={actionClass}
              onClick={() => run(() => pinComment({ postId: ctx.postId, id: comment.id, pin: !comment.pinned }))}
            >
              {comment.pinned ? "고정 해제" : "고정"}
            </button>
          )}
          {ctx.viewerId && !mine && !comment.hidden && (
            <button type="button" className={actionClass} onClick={() => setMode(mode === "report" ? "idle" : "report")}>
              신고
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      {mode === "reply" && (
        <div className="mt-2">
          <CommentForm
            postId={ctx.postId}
            parentId={comment.id}
            initial={`@${comment.author.handle} `}
            onDone={() => setMode("idle")}
          />
        </div>
      )}
      {mode === "report" && <ReportForm commentId={comment.id} onDone={() => setMode("idle")} />}
    </article>
  );
}

function CommentForm({
  postId,
  parentId,
  editId,
  initial = "",
  onDone,
}: {
  postId: string;
  parentId: string | null;
  editId?: string;
  initial?: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = editId ? "댓글 고치기" : parentId ? "답글 쓰기" : "댓글 쓰기";

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = editId ? await editComment({ postId, id: editId, body }) : await addComment({ postId, parentId, body });
          if (!result.ok) return setError(result.error);
          setBody("");
          onDone?.();
          router.refresh();
        });
      }}
    >
      <label className="sr-only" htmlFor={`comment-${editId ?? parentId ?? "new"}`}>
        {label}
      </label>
      <textarea
        id={`comment-${editId ?? parentId ?? "new"}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_MAX}
        rows={parentId || editId ? 2 : 3}
        placeholder={parentId ? "답글을 남겨 주세요" : "따뜻한 한마디를 남겨 주세요. @핸들로 언급할 수 있어요."}
        className="rounded-xl border border-line bg-bg px-3 py-2 text-base"
      />
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!body.trim() || pending}
          className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "저장 중…" : editId ? "고치기" : parentId ? "답글 달기" : "댓글 달기"}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="min-h-10 rounded-xl border border-line px-4 text-sm">
            취소
          </button>
        )}
      </div>
    </form>
  );
}

function ReportForm({ commentId, onDone }: { commentId: string; onDone: () => void }) {
  const [reason, setReason] = useState<(typeof COMMENT_REPORT_REASONS)[number]>("spam");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  if (done) {
    return (
      <p role="status" className="text-xs text-quiet">
        신고했어요. 운영자가 확인할게요.{" "}
        <button type="button" className="underline" onClick={onDone}>
          닫기
        </button>
      </p>
    );
  }
  return (
    <form
      className="mt-1 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await reportComment({ id: commentId, reason });
          if (!result.ok) setError(result.error);
          else setDone(true);
        });
      }}
    >
      <label className="sr-only" htmlFor={`report-${commentId}`}>
        신고 사유
      </label>
      <select
        id={`report-${commentId}`}
        value={reason}
        onChange={(e) => setReason(e.target.value as typeof reason)}
        className="min-h-10 rounded-xl border border-line bg-bg px-2 text-sm"
      >
        {COMMENT_REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {r === "portrait_rights" ? "내 개인정보 · 초상 침해" : REASON_LABEL[r].title}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="min-h-10 rounded-xl border border-line px-3 text-sm">
        신고하기
      </button>
      <button type="button" onClick={onDone} className="min-h-10 px-2 text-sm text-quiet">
        취소
      </button>
      {error && (
        <p role="alert" className="w-full text-xs text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}

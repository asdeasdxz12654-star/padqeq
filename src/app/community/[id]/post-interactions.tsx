"use client";

import { confirmAction } from "@/lib/ui/confirm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CASTING_FORM_FIELDS, type CastingForm, SAFETY_GUIDE } from "@/lib/boards/labels";
import { COMMENT_REPORT_REASONS } from "@/lib/comments/input";
import { REASON_LABEL } from "@/lib/moderation/reasons";
import { profileHref } from "@/lib/profiles/profile-href";
import { addReply, applyCasting, closeBoardPost, deleteBoardPost, deleteReply, editReply, reportBoard } from "../actions";

type Result = { ok: true } | { ok: false; error: string };
const small = "min-h-8 text-xs text-quiet hover:text-text disabled:opacity-50";
const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<Result>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) return setError(result.error);
      after?.();
      router.refresh();
    });
  return { run, error, pending, router };
}

/** 글쓴이: 고치기 · 마감 · 지우기 / 남: 신고 */
export function PostActions({ id, mine, closed, isCasting, canReport }: { id: string; mine: boolean; closed: boolean; isCasting: boolean; canReport: boolean }) {
  const { run, error, pending, router } = useRun();
  const [reporting, setReporting] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-4">
        {mine && (
          <>
            <Link href={`/community/write?edit=${id}`} className={small}>
              고치기
            </Link>
            {isCasting && (
              <button type="button" disabled={pending} className={small} onClick={() => run(() => closeBoardPost(id, !closed))}>
                {closed ? "마감 취소" : "마감하기"}
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              className={small}
              onClick={async () => {
                if (await confirmAction({ title: "이 글을 지울까요?", body: "답글도 함께 지워져요.", confirmLabel: "지우기", danger: true }))
                  run(() => deleteBoardPost(id), () => router.push("/community"));
              }}
            >
              지우기
            </button>
          </>
        )}
        {canReport && (
          <button type="button" className={small} onClick={() => setReporting((v) => !v)}>
            신고
          </button>
        )}
      </div>
      {reporting && <ReportForm postId={id} replyId={null} onDone={() => setReporting(false)} />}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function ReportForm({ postId, replyId, onDone }: { postId: string; replyId: string | null; onDone: () => void }) {
  const [reason, setReason] = useState<(typeof COMMENT_REPORT_REASONS)[number]>("spam");
  const [done, setDone] = useState(false);
  const { run, error, pending } = useRun();
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
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => reportBoard({ postId, replyId, reason }), () => setDone(true));
      }}
    >
      <label className="sr-only" htmlFor={`report-${replyId ?? postId}`}>
        신고 사유
      </label>
      <select
        id={`report-${replyId ?? postId}`}
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
      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </form>
  );
}

export type ReplyView = { id: string; body: string; hidden: boolean; edited: boolean; createdAt: string; author: { id: string; handle: string } };

export function Replies({
  postId,
  replies,
  viewerId,
  postAuthorId,
  canWrite,
  closedReason,
}: {
  postId: string;
  replies: ReplyView[];
  viewerId: string | null;
  postAuthorId: string;
  canWrite: boolean;
  closedReason: string | null;
}) {
  const { run, error, pending } = useRun();
  const [body, setBody] = useState("");
  return (
    <section aria-labelledby="replies-heading" className="flex flex-col gap-4">
      <h2 id="replies-heading" className="text-sm font-semibold">
        답글 <span className="font-normal text-quiet">{replies.length}</span>
      </h2>
      {replies.length > 0 && (
        <ul className="flex flex-col gap-4">
          {replies.map((r) => (
            <li key={r.id}>
              <ReplyItem postId={postId} reply={r} viewerId={viewerId} postAuthorId={postAuthorId} />
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addReply({ postId, body }), () => setBody(""));
          }}
        >
          <label className="sr-only" htmlFor="reply-new">
            답글 쓰기
          </label>
          <textarea
            id="reply-new"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="답글을 남겨 주세요"
            className="rounded-xl border border-line bg-bg px-3 py-2 text-base"
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={!body.trim() || pending} className="min-h-10 self-start rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
            답글 달기
          </button>
        </form>
      ) : (
        closedReason && <p className="text-sm text-quiet">{closedReason}</p>
      )}
    </section>
  );
}

function ReplyItem({ postId, reply, viewerId, postAuthorId }: { postId: string; reply: ReplyView; viewerId: string | null; postAuthorId: string }) {
  const { run, error, pending } = useRun();
  const [mode, setMode] = useState<"idle" | "edit" | "report">("idle");
  const [body, setBody] = useState(reply.body);
  const mine = viewerId === reply.author.id;
  return (
    <article className="flex flex-col gap-1">
      <p className="flex flex-wrap gap-x-2 text-xs text-quiet">
        <Link href={profileHref(reply.author.handle)} className="font-semibold text-text hover:underline">
          @{reply.author.handle}
        </Link>
        <time dateTime={reply.createdAt}>{dateFormat.format(new Date(reply.createdAt))}</time>
        {reply.edited && <span>수정됨</span>}
      </p>
      {reply.hidden ? (
        <p className="text-sm text-quiet">운영 정책에 따라 가려진 답글이에요.</p>
      ) : mode === "edit" ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => editReply({ postId, id: reply.id, body }), () => setMode("idle"));
          }}
        >
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={2} aria-label="답글 고치기" className="rounded-xl border border-line bg-bg px-3 py-2 text-base" />
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">
              고치기
            </button>
            <button type="button" onClick={() => setMode("idle")} className="min-h-10 rounded-xl border border-line px-4 text-sm">
              취소
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm leading-relaxed break-words whitespace-pre-line">{reply.body}</p>
      )}
      {mode !== "edit" && (
        <div className="flex gap-x-3">
          {mine && !reply.hidden && (
            <button type="button" className={small} onClick={() => setMode("edit")}>
              수정
            </button>
          )}
          {(mine || viewerId === postAuthorId) && (
            <button
              type="button"
              disabled={pending}
              className={small}
              onClick={async () => {
                if (await confirmAction({ title: "이 답글을 지울까요?", confirmLabel: "지우기", danger: true })) run(() => deleteReply({ postId, id: reply.id }));
              }}
            >
              삭제
            </button>
          )}
          {viewerId && !mine && !reply.hidden && (
            <button type="button" className={small} onClick={() => setMode(mode === "report" ? "idle" : "report")}>
              신고
            </button>
          )}
        </div>
      )}
      {mode === "report" && <ReportForm postId={postId} replyId={reply.id} onDone={() => setMode("idle")} />}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </article>
  );
}

/** 섭외 지원 (S-13 ⑦): 문의서를 채우면 글쓴이와 메시지 대화가 열린다 */
export function CastingApply({ postId, recipient }: { postId: string; recipient: string }) {
  const { error, pending, router } = useRun();
  const [open, setOpen] = useState(false);
  const [guideRead, setGuideRead] = useState(false);
  const [form, setForm] = useState<CastingForm>({ date: "", place: "", concept: "", terms: "", usage: "", credit: "" });
  const [body, setBody] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent">
        지원하기
      </button>
    );
  }
  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitError(null);
        startSending(async () => {
          const result = await applyCasting({ postId, recipient, body, form });
          if (!result.ok) return setSubmitError(result.error);
          router.push(`/me/messages/${result.threadId}`);
        });
      }}
    >
      <p className="font-semibold">섭외 문의서</p>
      <p className="text-xs text-quiet">대화의 첫 메시지로 붙어요. 나중에 분쟁이 생기면 근거가 돼요.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CASTING_FORM_FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1.5 text-sm">
            {f.label} {!f.required && <span className="text-xs text-quiet">(선택)</span>}
            <input
              value={form[f.key]}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              maxLength={100}
              required={f.required}
              placeholder={f.placeholder}
              className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-sm">
        인사말
        <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} required className="rounded-xl border border-line bg-bg px-3 py-2 text-base" />
      </label>
      <div className="rounded-xl border border-warn-line bg-warn-soft p-3 text-xs leading-relaxed text-warn">
        <ul className="list-disc pl-5">
          {SAFETY_GUIDE.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={guideRead} onChange={(e) => setGuideRead(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          안전 가이드를 확인했어요
        </label>
      </div>
      {(submitError ?? error) && (
        <p role="alert" className="text-sm text-danger">
          {submitError ?? error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={!guideRead || sending || pending} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
          {sending ? "보내는 중…" : "지원 보내기"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl border border-line px-4">
          취소
        </button>
      </div>
    </form>
  );
}

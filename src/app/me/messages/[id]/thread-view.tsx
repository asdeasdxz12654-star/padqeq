"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CASTING_FORM_FIELDS, SAFETY_GUIDE } from "@/lib/boards/labels";
import { COMMENT_REPORT_REASONS } from "@/lib/comments/input";
import { REASON_LABEL } from "@/lib/moderation/reasons";
import { dismissGuide, markThreadRead, reportThread, respondThread, sendMessage, setBlock } from "../actions";

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export type MessageView = { id: number; mine: boolean; body: string; form: Record<string, string> | null; createdAt: string };

/** 대화를 열면 읽음 처리 */
export function MarkThreadRead({ threadId, latest }: { threadId: string; latest: number }) {
  useEffect(() => {
    void markThreadRead(threadId);
  }, [threadId, latest]);
  return null;
}

export function CastingFormCard({ form }: { form: Record<string, string> }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-xl border border-line bg-surface p-3 text-sm">
      <dt className="col-span-2 mb-1 font-semibold">섭외 문의서</dt>
      {CASTING_FORM_FIELDS.filter((f) => form[f.key]).map((f) => (
        <div key={f.key} className="contents">
          <dt className="text-quiet">{f.label}</dt>
          <dd className="break-words">{form[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SafetyGuide({ threadId }: { threadId: string }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div role="note" className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs leading-relaxed text-amber-100">
      <p className="font-semibold">첫 촬영 안전 가이드</p>
      <ul className="mt-1 list-disc pl-5">
        {SAFETY_GUIDE.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          void dismissGuide(threadId);
        }}
        className="mt-2 min-h-8 underline"
      >
        확인했어요, 다시 보지 않기
      </button>
    </div>
  );
}

export function Messages({ messages, otherReadAt }: { messages: MessageView[]; otherReadAt: string | null }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages.length]);
  const lastMine = [...messages].reverse().find((m) => m.mine);
  return (
    <ol className="flex flex-col gap-2" aria-label="메시지">
      {messages.map((m) => (
        <li key={m.id} className={`flex max-w-[85%] flex-col gap-1 ${m.mine ? "items-end self-end" : "items-start self-start"}`}>
          {m.form && <CastingFormCard form={m.form} />}
          <p
            className={`rounded-2xl px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-line ${
              m.mine ? "rounded-br-sm bg-accent text-on-accent" : "rounded-bl-sm bg-slot"
            }`}
          >
            <span className="sr-only">{m.mine ? "나: " : "상대: "}</span>
            {m.body}
          </p>
          <time dateTime={m.createdAt} className="text-[11px] text-quiet">
            {timeFormat.format(new Date(m.createdAt))}
            {m.id === lastMine?.id && otherReadAt && otherReadAt >= m.createdAt && " · 읽음"}
          </time>
        </li>
      ))}
      <li ref={end} aria-hidden="true" />
    </ol>
  );
}

export function RequestBar({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const respond = (accept: boolean) =>
    startTransition(async () => {
      const result = await respondThread(threadId, accept);
      if (result.ok) {
        if (accept) router.refresh();
        else router.push("/me/messages?tab=requests");
      }
    });
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-3 text-sm">
      <p>내가 팔로우하지 않는 사람이 보낸 메시지 요청이에요. 수락하기 전에는 상대가 읽음 여부를 알 수 없어요.</p>
      <div className="flex gap-2">
        <button type="button" disabled={pending} onClick={() => respond(true)} className="min-h-10 rounded-xl bg-accent px-4 font-semibold text-on-accent">
          수락
        </button>
        <button type="button" disabled={pending} onClick={() => respond(false)} className="min-h-10 rounded-xl border border-line px-4">
          거절
        </button>
      </div>
    </div>
  );
}

export function Composer({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await sendMessage({ threadId, body });
          if (!result.ok) return setError(result.error);
          setBody("");
          router.refresh();
        });
      }}
    >
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="message-input">
          메시지 입력
        </label>
        <textarea
          id="message-input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            // 데스크톱: Enter 보내기 · Shift+Enter 줄바꿈 (한글 조합 중에는 보내지 않음)
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer: fine)").matches) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={2000}
          rows={2}
          placeholder="메시지 입력"
          className="min-h-11 flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2 text-base"
        />
        <button type="submit" disabled={!body.trim() || pending} className="min-h-11 shrink-0 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
          보내기
        </button>
      </div>
      <p className="text-[11px] text-quiet">사진 첨부는 없어요. 해담 게시물 주소를 붙여 보내 주세요.</p>
    </form>
  );
}

export function ThreadMenu({ threadId, otherId, blocked }: { threadId: string; otherId: string; blocked: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<(typeof COMMENT_REPORT_REASONS)[number]>("spam");
  const [detail, setDetail] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => setOpen((v) => !v)} className="min-h-10 text-quiet hover:text-text">
          신고
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setBlock(otherId, !blocked);
              setMessage(result.ok ? (blocked ? "차단을 풀었어요." : "차단했어요. 서로 메시지를 보낼 수 없어요.") : result.error);
              router.refresh();
            })
          }
          className="min-h-10 text-quiet hover:text-text"
        >
          {blocked ? "차단 풀기" : "차단"}
        </button>
      </div>
      {open && (
        <form
          className="flex w-full flex-col gap-2 rounded-xl border border-line p-3 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await reportThread({ threadId, reason, detail, alsoBlock });
              setMessage(result.ok ? "신고했어요. 운영자가 이 대화를 확인할 수 있게 돼요." : result.error);
              if (result.ok) {
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          <p className="text-xs text-quiet">신고하면 운영자가 이 대화의 내용을 볼 수 있게 되고, 열람 기록이 남아요.</p>
          <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} aria-label="신고 사유" className="min-h-10 rounded-xl border border-line bg-bg px-2">
            {COMMENT_REPORT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r === "portrait_rights" ? "내 개인정보 · 초상 침해" : REASON_LABEL[r].title}
              </option>
            ))}
          </select>
          <textarea value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={1000} rows={2} placeholder="자세한 내용 (선택)" aria-label="자세한 내용" className="rounded-xl border border-line bg-bg px-3 py-2 text-base" />
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={alsoBlock} onChange={(e) => setAlsoBlock(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            차단도 함께
          </label>
          <button type="submit" disabled={pending} className="min-h-10 self-start rounded-xl border border-line px-4">
            신고하기
          </button>
        </form>
      )}
      {message && (
        <p role="status" className="text-xs text-quiet">
          {message}
        </p>
      )}
    </div>
  );
}

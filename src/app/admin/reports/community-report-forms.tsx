"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CastingFormCard } from "@/app/me/messages/[id]/thread-view";
import { moderateBoard, openReportedThread, type ReportedMessage, resolveMessageReport } from "./actions";
import { KST } from "@/lib/format/kst";

const timeFormat = KST.monthDayTime;

function DecisionRow<D extends string>({
  name,
  options,
  submit,
}: {
  name: string;
  options: { value: D; label: string; help: string }[];
  submit: (decision: D, note: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<D | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!decision) return;
        startTransition(async () => {
          const result = await submit(decision, note);
          if (!result.ok) return setError(result.error ?? "처리하지 못했어요.");
          router.refresh();
        });
      }}
    >
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">조치</legend>
        {options.map((o) => (
          <label key={o.value} title={o.help} className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-checked:border-accent">
            <input type="radio" name={name} checked={decision === o.value} onChange={() => setDecision(o.value)} className="size-4 accent-[var(--accent)]" />
            {o.label}
          </label>
        ))}
      </fieldset>
      {decision && <p className="text-xs text-quiet">{options.find((o) => o.value === decision)?.help}</p>}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={500}
        required
        aria-label="처리 사유"
        placeholder="처리 사유 (필수 · 내부 기록)"
        className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={!decision || !note.trim() || pending} className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
        처리 완료
      </button>
    </form>
  );
}

export function BoardDecisionForm({ postId, replyId }: { postId: string; replyId: string | null }) {
  return (
    <DecisionRow
      name={`board-${replyId ?? postId}`}
      options={[
        { value: "dismiss", label: "기각", help: "문제 없음. 자동으로 가려졌다면 다시 보이게 해요." },
        { value: "hide", label: "가리기", help: "쓴 사람과 운영자만 보게 돼요. 쓴 사람에게 알림이 가요." },
      ]}
      submit={(decision, note) => moderateBoard({ postId, replyId, decision, note })}
    />
  );
}

/** 신고된 대화: 누를 때만 열고(감사 로그), 처리한다 */
export function MessageReportPanel({ reportId }: { reportId: string }) {
  const [messages, setMessages] = useState<ReportedMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      {messages === null ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await openReportedThread(reportId);
              if (!result.ok) return setError(result.error);
              setMessages(result.messages);
            })
          }
          className="min-h-10 self-start rounded-xl border border-line px-4 text-sm"
        >
          대화 열기 <span className="text-xs text-quiet">(열람 기록이 남아요)</span>
        </button>
      ) : (
        <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto rounded-xl bg-slot p-3 text-sm">
          {messages.map((m) => (
            <li key={m.id} className="flex flex-col gap-1">
              <span className="text-xs text-quiet">
                @{m.sender ?? "탈퇴한 회원"} · {timeFormat.format(new Date(m.createdAt))}
              </span>
              {m.form && <CastingFormCard form={m.form} />}
              <span className="break-words whitespace-pre-line">{m.body}</span>
            </li>
          ))}
        </ol>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <DecisionRow
        name={`message-${reportId}`}
        options={[
          { value: "dismiss", label: "기각", help: "문제 없음." },
          { value: "actioned", label: "조치함", help: "경고 · 이용 정지 등은 회원 관리에서 따로 해요." },
        ]}
        submit={(decision, note) => resolveMessageReport({ reportId, decision, note })}
      />
    </div>
  );
}

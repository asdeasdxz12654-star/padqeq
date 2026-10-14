"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type EventDraft, EventForm } from "@/components/event-form";
import { deleteEventAdmin, rejectEventAdmin, saveEventAdmin } from "./actions";

/** 운영자 행사 편집 (제안 승인 포함) + 거절 · 지우기 */
export function EventAdminEditor({ id, initial, proposed }: { id: string | null; initial: EventDraft; proposed: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      <EventForm
        key={id ?? "new"}
        initial={initial}
        withTagSlug
        submit={(input) => saveEventAdmin(id, input)}
        submitLabel={proposed ? "승인하고 등록" : id ? "고치기" : "등록"}
        doneHref="/admin/events"
      />
      {id && proposed && (
        <form
          className="flex flex-col gap-2 rounded-xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await rejectEventAdmin(id, note);
              if (!result.ok) return setError(result.error);
              router.push("/admin/events");
              router.refresh();
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            등록하지 않기 <span className="text-xs text-quiet">(사유는 제안한 회원에게 보여요)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} required className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base" />
          </label>
          <button type="submit" disabled={!note.trim() || pending} className="min-h-11 self-start rounded-xl border border-line px-4 text-sm disabled:opacity-50">
            거절
          </button>
        </form>
      )}
      {id && !proposed && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("이 행사를 지울까요? 행사 태그와 사진은 남아요.")) return;
            startTransition(async () => {
              const result = await deleteEventAdmin(id);
              if (!result.ok) return setError(result.error);
              router.push("/admin/events");
              router.refresh();
            });
          }}
          className="min-h-11 self-start rounded-xl border border-line px-4 text-sm text-red-300"
        >
          행사 지우기
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

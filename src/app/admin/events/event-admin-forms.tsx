"use client";

import { confirmAction } from "@/lib/ui/confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type EventDraft, EventForm } from "@/components/event-form";
import { deleteEventAdmin, rejectEventAdmin, saveEventAdmin } from "./actions";
import { EventPlaceForm, type PlaceOption } from "./event-place-form";

/** 운영자 행사 편집 (제안 승인 포함) + 거절 · 지우기 */
export function EventAdminEditor({
  id,
  initial,
  proposed,
  placeId,
  places,
  doneHref = "/admin/events",
}: {
  id: string | null;
  initial: EventDraft;
  proposed: boolean;
  placeId: string | null;
  places: PlaceOption[];
  /** 등록 · 거절 · 지우기 뒤 갈 곳 (처리함에서 열면 처리함) */
  doneHref?: string;
}) {
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
        doneHref={doneHref}
      />
      {id && <EventPlaceForm key={id} eventId={id} current={placeId} places={places} />}
      {id && proposed && (
        <form
          className="flex flex-col gap-2 rounded-xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await rejectEventAdmin(id, note);
              if (!result.ok) return setError(result.error);
              router.push(doneHref);
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
          onClick={async () => {
            if (!(await confirmAction({ title: "이 행사를 지울까요?", body: "행사 태그와 사진은 남아요.", confirmLabel: "지우기", danger: true }))) return;
            startTransition(async () => {
              const result = await deleteEventAdmin(id);
              if (!result.ok) return setError(result.error);
              router.push(doneHref);
              router.refresh();
            });
          }}
          className="min-h-11 self-start rounded-xl border border-line px-4 text-sm text-danger"
        >
          행사 지우기
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setAttendance } from "./actions";

/** 참가 예정 (S-12 ②). 기본은 나만 보기, 공개하면 참가자 목록에 코스 메모와 함께 보인다. */
export function AttendPanel({
  eventId,
  initial,
}: {
  eventId: string;
  initial: { isPublic: boolean; cosNote: string } | null;
}) {
  const router = useRouter();
  const [attending, setAttending] = useState(initial !== null);
  const [isPublic, setIsPublic] = useState(initial?.isPublic ?? false);
  const [cosNote, setCosNote] = useState(initial?.cosNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const save = (next: { attending: boolean; isPublic: boolean; cosNote: string }) =>
    startTransition(async () => {
      setError(null);
      setSaved(false);
      const result = await setAttendance({ eventId, ...next });
      if (!result.ok) return setError(result.error);
      setAttending(next.attending);
      setSaved(next.attending);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <button
        type="button"
        aria-pressed={attending}
        disabled={pending}
        onClick={() => save({ attending: !attending, isPublic, cosNote })}
        className={`min-h-11 rounded-xl font-semibold disabled:opacity-50 ${attending ? "border border-line" : "bg-accent text-on-accent"}`}
      >
        {attending ? "참가 예정 취소" : "참가 예정"}
      </button>
      {attending && (
        <form
          className="flex flex-col gap-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            save({ attending: true, isPublic, cosNote });
          }}
        >
          <p className="text-xs text-quiet">행사 전날 알림을 보내 드려요.</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            참가자 목록에 나를 보여 주기
          </label>
          {isPublic && (
            <label className="flex flex-col gap-1.5">
              코스 메모 <span className="text-xs text-quiet">(선택 · 현장에서 서로 찾기용, 예: 원신 · 라이덴 쇼군)</span>
              <input
                value={cosNote}
                onChange={(e) => setCosNote(e.target.value)}
                maxLength={100}
                className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base"
              />
            </label>
          )}
          <button type="submit" disabled={pending} className="min-h-10 self-start rounded-xl border border-line px-4 disabled:opacity-50">
            저장
          </button>
        </form>
      )}
      {saved && (
        <p role="status" className="text-xs text-emerald-400">
          저장했어요.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}

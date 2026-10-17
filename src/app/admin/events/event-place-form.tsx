"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setEventPlaceAdmin } from "./actions";

export type PlaceOption = { id: string; name: string; hasLocation: boolean };

/** 행사가 열리는 곳: 공식 장소 태그를 고른다. 행사 태그에 위치가 없으면 지도는 이 장소의 위치를 쓴다. */
export function EventPlaceForm({ eventId, current, places }: { eventId: string; current: string | null; places: PlaceOption[] }) {
  const router = useRouter();
  const [placeId, setPlaceId] = useState(current ?? "");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const chosen = places.find((p) => p.id === placeId);

  return (
    <form
      className="flex flex-col gap-2 rounded-xl border border-line p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await setEventPlaceAdmin(eventId, placeId || null);
          if (!result.ok) return setMessage({ ok: false, text: result.error });
          setMessage({ ok: true, text: placeId ? "장소를 연결했어요." : "장소 연결을 풀었어요." });
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        열리는 곳 (장소 태그)
        <select value={placeId} onChange={(e) => setPlaceId(e.target.value)} className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base">
          <option value="">연결 안 함</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.hasLocation ? "" : " (위치 없음)"}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-quiet">
        {places.length === 0
          ? "공식 장소 태그가 아직 없어요. 장소 태그를 먼저 만들어 주세요."
          : chosen && !chosen.hasLocation
            ? "이 장소는 아직 지도 위치가 없어요. 장소 태그 화면에서 위치를 정하면 행사도 지도에 나와요."
            : "행사 화면에 장소가 이어지고, 행사에 따로 위치가 없으면 지도에 장소 위치로 나와요."}
      </p>
      <button
        type="submit"
        disabled={pending || placeId === (current ?? "")}
        className="min-h-11 self-start rounded-xl border border-line px-4 text-sm hover:border-quiet disabled:opacity-50"
      >
        {pending ? "저장 중…" : "장소 저장"}
      </button>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-quiet" : "text-red-300"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}

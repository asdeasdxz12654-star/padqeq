"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MiniMap } from "@/components/mini-map";
import { formatLatLng, type LatLng, parseLatLng } from "@/lib/places/location";
import { setTagLocation } from "./actions";

/** 지도 위치 정하기 · 지우기 (운영자). 지도를 누르거나, 좌표 · 구글 · OpenStreetMap 지도 주소를 붙여 넣는다. */
export function LocationForm({ tagId, current }: { tagId: string; current: LatLng | null }) {
  const router = useRouter();
  const [location, setLocation] = useState(current ? formatLatLng(current) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const point = location.trim() ? parseLatLng(location) : null;
  const field = "min-h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-base";

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setTagLocation({ tagId, location, note });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNote("");
          router.refresh();
        });
      }}
    >
      <MiniMap point={point} label="위치 고르기 지도 (누른 자리가 위치가 돼요)" onPick={(p) => setLocation(formatLatLng(p))} />
      <label className="flex flex-col gap-1.5">
        좌표 또는 지도 주소 <span className="text-xs text-quiet">(비우면 지도에서 빠져요)</span>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="37.5665, 126.9780" className={field} />
        <span className="text-xs text-quiet">
          {location.trim()
            ? point
              ? `읽은 위치: ${point.lat}, ${point.lng}`
              : "좌표를 읽지 못했어요."
            : "위 지도를 누르거나, 구글 지도에서 오른쪽 클릭으로 복사한 좌표를 붙여 넣어요. 공원 입구 · 행사장 건물처럼 공개된 곳으로만."}
        </span>
      </label>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor={`location-note-${tagId}`}>
          이유
        </label>
        <input
          id={`location-note-${tagId}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="이유 (감사 로그에 남아요)"
          className={`${field} flex-1`}
        />
        <button
          type="submit"
          disabled={pending || !note.trim() || (location.trim() !== "" && !point)}
          className="min-h-11 shrink-0 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}

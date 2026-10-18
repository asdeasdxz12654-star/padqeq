"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { REGIONS, type Region, eventTagSlug } from "@/lib/events/calendar";

export type EventDraft = {
  name: string;
  startsOn: string;
  endsOn: string;
  venue: string;
  region: Region;
  url: string;
  description: string;
};

/** 열리는 곳으로 고를 수 있는 공식 장소 태그 */
export type EventPlaceOption = { id: string; name: string };

type Submit = (input: EventDraft & { tagSlug: string; placeTagId: string | null }) => Promise<{ ok: true } | { ok: false; error: string }>;

const input = "min-h-11 rounded-xl border border-line bg-bg px-3 text-base";

/** 행사 입력 (회원 제안 · 운영자 등록 공용). withTagSlug면 행사 태그 주소도 받는다 (운영자). places를 주면 장소 태그도 고른다 (선택). */
export function EventForm({
  initial,
  submit,
  submitLabel,
  withTagSlug = false,
  doneHref,
  doneMessage,
  places,
}: {
  initial: EventDraft;
  submit: Submit;
  submitLabel: string;
  withTagSlug?: boolean;
  doneHref?: string;
  doneMessage?: string;
  places?: EventPlaceOption[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [tagSlug, setTagSlug] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const slug = tagSlug ?? (draft.name && draft.startsOn ? eventTagSlug(draft.name, draft.startsOn) : "");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submit({ ...draft, tagSlug: slug, placeTagId: placeId || null });
          if (!result.ok) return setError(result.error);
          setDone(true);
          if (doneHref) router.push(doneHref);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        행사 이름
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={80} required className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          시작
          <input type="date" value={draft.startsOn} onChange={(e) => set("startsOn", e.target.value)} required className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          끝
          <input type="date" value={draft.endsOn} min={draft.startsOn} onChange={(e) => set("endsOn", e.target.value)} required className={input} />
        </label>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          장소
          <input value={draft.venue} onChange={(e) => set("venue", e.target.value)} maxLength={80} required placeholder="예: SETEC" className={input} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          지역
          <select value={draft.region} onChange={(e) => set("region", e.target.value as Region)} className={input}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>
      {places && places.length > 0 && (
        <label className="flex flex-col gap-1.5 text-sm">
          장소 태그 <span className="text-xs text-quiet">(선택 · 고르면 행사 화면과 지도에 그 장소가 이어져요)</span>
          <select
            value={placeId}
            onChange={(e) => {
              const id = e.target.value;
              setPlaceId(id);
              // 장소 칸이 비어 있으면 고른 장소 이름으로 채운다
              const place = places.find((p) => p.id === id);
              if (place && !draft.venue.trim()) set("venue", place.name.slice(0, 80));
            }}
            className={input}
          >
            <option value="">목록에 없음 · 고르지 않음</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex flex-col gap-1.5 text-sm">
        공식 사이트 <span className="text-xs text-quiet">(선택 · https://)</span>
        <input type="url" value={draft.url} onChange={(e) => set("url", e.target.value)} maxLength={500} className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        설명 <span className="text-xs text-quiet">(선택)</span>
        <textarea value={draft.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} rows={4} className={`${input} py-2`} />
      </label>
      {withTagSlug && (
        <label className="flex flex-col gap-1.5 text-sm">
          행사 태그 주소 <span className="text-xs text-quiet">(처음 등록할 때만 쓰여요. 같은 주소의 행사 태그가 있으면 그 태그를 써요)</span>
          <input value={slug} onChange={(e) => setTagSlug(e.target.value.toLowerCase())} maxLength={60} required className={input} />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {done && doneMessage && (
        <p role="status" className="text-sm text-ok">
          {doneMessage}
        </p>
      )}
      <button type="submit" disabled={pending} className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
        {pending ? "저장 중…" : submitLabel}
      </button>
    </form>
  );
}

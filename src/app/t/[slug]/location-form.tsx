"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MiniMap } from "@/components/mini-map";
import type { PlaceResult } from "@/lib/places/geocode";
import { formatLatLng, type LatLng, parseLatLng } from "@/lib/places/location";
import { findPlace, setTagLocation } from "./actions";

/** 지도 위치 정하기 · 지우기 (운영자). 주소로 찾거나, 지도를 누르거나, 좌표 · 구글 · OpenStreetMap 지도 주소를 붙여 넣는다. */
export function LocationForm({ tagId, tagName, current }: { tagId: string; tagName: string; current: LatLng | null }) {
  const router = useRouter();
  const [location, setLocation] = useState(current ? formatLatLng(current) : "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(tagName);
  const [found, setFound] = useState<{ query: string; results: PlaceResult[] } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const point = location.trim() ? parseLatLng(location) : null;
  const field = "min-h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-base";

  const runSearch = () => {
    setSearchError(null);
    startSearch(async () => {
      const result = await findPlace(search);
      if (!result.ok) {
        setFound(null);
        setSearchError(result.error);
        return;
      }
      setFound(result);
    });
  };

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
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`place-search-${tagId}`}>주소 · 장소 이름으로 찾기</label>
        <div className="flex gap-2">
          <input
            id={`place-search-${tagId}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              // 이 칸에서 Enter는 저장이 아니라 찾기
              if (e.key === "Enter") {
                e.preventDefault();
                if (!searching) runSearch();
              }
            }}
            maxLength={200}
            placeholder="대구광역시 북구 엑스코로 10"
            className={`${field} flex-1`}
          />
          <button
            type="button"
            onClick={runSearch}
            disabled={searching || search.trim().length < 2}
            className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm hover:border-quiet disabled:opacity-50"
          >
            {searching ? "찾는 중…" : "찾기"}
          </button>
        </div>
        {searchError && (
          <p role="alert" className="text-sm text-danger">
            {searchError}
          </p>
        )}
        {found && (
          <div role="status" className="flex flex-col gap-1.5">
            {found.results.length === 0 ? (
              <p className="text-xs text-quiet">찾지 못했어요. 도로명 주소나 건물 이름만 짧게 넣어 보거나, 아래 지도를 직접 눌러 주세요.</p>
            ) : (
              <>
                <p className="text-xs text-quiet">
                  {found.query !== search.trim() && `‘${found.query}’(으)로 찾았어요. `}맞는 곳을 누르면 지도에 표시돼요. 저장을 눌러야 정해져요.
                </p>
                <ul className="flex flex-col gap-1.5">
                  {found.results.map((r) => {
                    const chosen = point?.lat === r.lat && point?.lng === r.lng;
                    return (
                      <li key={`${r.lat},${r.lng}`}>
                        <button
                          type="button"
                          aria-pressed={chosen}
                          onClick={() => setLocation(formatLatLng(r))}
                          className="flex min-h-11 w-full flex-col rounded-xl border border-line px-3 py-2 text-left text-sm hover:border-quiet aria-pressed:border-accent"
                        >
                          <span className="font-semibold break-words">{r.name}</span>
                          <span className="text-xs break-words text-quiet">{r.address}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <p className="text-xs text-quiet">검색: © OpenStreetMap 기여자 (Nominatim)</p>
          </div>
        )}
      </div>
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
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

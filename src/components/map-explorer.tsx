"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { type MapPlace, PlaceMap } from "@/components/place-map";
import { formatDistance, type LatLng, sortByDistance } from "@/lib/places/location";

type Locating = { state: "idle" } | { state: "finding" } | { state: "found"; me: LatLng } | { state: "error"; message: string };

const noSubscribe = () => () => {};

/**
 * 촬영 장소 지도 + 목록. '내 주변'을 누르면 기기 위치로 가까운 순으로 보여 준다.
 * 위치는 이 화면 안에서만 쓰고 서버로 보내거나 저장하지 않는다 (새로 고침하면 잊는다).
 */
export function MapExplorer({ places, focus }: { places: MapPlace[]; focus: string | null }) {
  const [locating, setLocating] = useState<Locating>({ state: "idle" });
  // 위치 기능이 없는 브라우저에서는 버튼을 숨긴다 (서버 렌더링에서는 숨긴 채로)
  const canLocate = useSyncExternalStore(
    noSubscribe,
    () => "geolocation" in navigator,
    () => false,
  );
  const me = locating.state === "found" ? locating.me : null;
  const list = me ? sortByDistance(places, me) : places.map((p) => ({ ...p, meters: null }));

  const locate = () => {
    setLocating({ state: "finding" });
    navigator.geolocation.getCurrentPosition(
      (pos) => setLocating({ state: "found", me: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) =>
        setLocating({
          state: "error",
          message:
            err.code === err.PERMISSION_DENIED
              ? "위치 권한이 꺼져 있어요. 브라우저 설정에서 이 사이트의 위치를 허용하면 가까운 곳부터 보여 드려요."
              : "위치를 찾지 못했어요. 잠시 뒤 다시 해 주세요.",
        }),
      // 대략적인 위치로 충분하다 (배터리 · 정확한 위치 노출을 줄인다)
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  return (
    <>
      {canLocate && places.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {me ? (
            <button
              type="button"
              onClick={() => setLocating({ state: "idle" })}
              className="min-h-11 rounded-xl border border-line px-4 text-sm hover:border-quiet"
            >
              내 주변 그만 보기
            </button>
          ) : (
            <button
              type="button"
              onClick={locate}
              disabled={locating.state === "finding"}
              className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              {locating.state === "finding" ? "위치 찾는 중…" : "내 주변 촬영지"}
            </button>
          )}
          <span role="status" className="text-xs text-quiet">
            {locating.state === "error"
              ? locating.message
              : me
                ? "가까운 순으로 보여 줘요. 내 위치는 이 화면에서만 쓰고 저장하지 않아요."
                : "누르면 가까운 촬영지부터 보여 줘요. 위치는 서버로 보내지 않아요."}
          </span>
        </div>
      )}

      <PlaceMap places={places} focus={focus} me={me} />

      <section aria-labelledby="place-list" className="flex flex-col gap-2">
        <h2 id="place-list" className="text-base font-semibold">
          장소 목록 <span className="text-sm font-normal text-quiet">{places.length}곳{me ? " · 가까운 순" : ""}</span>
        </h2>
        {places.length === 0 ? (
          <p className="py-8 text-center text-sm text-quiet">아직 지도에 표시된 장소가 없어요. 운영자가 장소 · 행사 태그에 위치를 달면 여기에 나와요.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/t/${encodeURIComponent(p.slug)}`}
                  className="flex min-h-11 items-baseline gap-2 rounded-xl border border-line px-3 py-2.5 hover:border-quiet"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-quiet">
                    {p.meters !== null && <span className="font-semibold text-text">{formatDistance(p.meters)} · </span>}
                    {p.kind === "event" ? "행사" : "장소"} · 게시물 {p.posts}개
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

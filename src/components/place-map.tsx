"use client";

import "leaflet/dist/leaflet.css";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { KOREA_CENTER, KOREA_ZOOM, type LatLng, groupByPosition, markerRadius, sortByDistance } from "@/lib/places/location";
import { accentColor, addOsmTiles } from "./map-tiles";

export type MapPlace = {
  id: string;
  slug: string;
  name: string;
  kind: "place" | "event";
  lat: number;
  lng: number;
  posts: number;
  /** 누르면 갈 곳 (기본: 태그 허브) */
  href?: string;
  /** 이름 아래 한 줄 (기본: 장소/행사 · 게시물 수) */
  detail?: string;
};

export const placeHref = (p: MapPlace) => p.href ?? `/t/${encodeURIComponent(p.slug)}`;
export const placeDetail = (p: MapPlace) => p.detail ?? `${p.kind === "event" ? "행사" : "장소"} · 게시물 ${p.posts}개`;

/**
 * 촬영 장소 지도 (S-04). OpenStreetMap 무료 지도 위에 장소 · 행사 태그를 원으로 보여 준다.
 * 누르면 이름 · 사진 수 · 태그 허브로 가는 링크. 같은 내용은 지도 아래 목록에도 있다 (키보드 · 화면 읽기 프로그램).
 */
export function PlaceMap({ places, focus, me = null }: { places: MapPlace[]; focus: string | null; me?: LatLng | null }) {
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();
  // 만든 지도 (내 위치 표시를 지도를 다시 만들지 않고 얹기 위해)
  const [view, setView] = useState<{ L: typeof import("leaflet"); map: import("leaflet").Map } | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("leaflet").then(({ default: L }) => {
      if (disposed || !box.current) return;
      const map = L.map(box.current, { zoomControl: true, attributionControl: true, worldCopyJump: true }).setView(
        [KOREA_CENTER.lat, KOREA_CENTER.lng],
        KOREA_ZOOM,
      );
      cleanup = () => {
        setView(null);
        map.remove();
      };
      setView({ L, map });
      addOsmTiles(L, map);

      const accent = accentColor();
      const markers = new Map<string, L.CircleMarker>();
      // 같은 자리(장소와 그 장소 위치를 쓰는 행사 등)는 점 하나로 묶고, 누르면 이름을 모두 보여 준다
      for (const group of groupByPosition(places)) {
        // 팝업 내용은 문자열 HTML이 아닌 요소로 만든다 (태그 이름을 그대로 글자로)
        const content = document.createElement("div");
        content.className = "flex flex-col gap-2 text-sm";
        for (const p of group) {
          const item = document.createElement("div");
          item.className = "flex flex-col gap-0.5";
          const link = document.createElement("a");
          link.href = placeHref(p);
          link.textContent = p.name;
          link.className = "font-semibold underline underline-offset-2";
          link.addEventListener("click", (e) => {
            e.preventDefault();
            router.push(link.pathname);
          });
          const meta = document.createElement("span");
          meta.textContent = placeDetail(p);
          meta.className = "text-xs opacity-75";
          item.append(link, meta);
          content.append(item);
        }

        const first = group[0]!;
        const marker = L.circleMarker([first.lat, first.lng], {
          radius: markerRadius(group.reduce((sum, p) => sum + p.posts, 0)),
          color: "#fff",
          weight: 1.5,
          fillColor: accent,
          fillOpacity: 0.85,
        })
          .bindTooltip(group.map((p) => p.name).join(" · "), { direction: "top", offset: [0, -6] })
          .bindPopup(content)
          .addTo(map);
        for (const p of group) markers.set(p.slug, marker);
      }

      const target = focus ? markers.get(focus) : undefined;
      if (target) {
        map.setView(target.getLatLng(), 15);
        target.openPopup();
      } else if (places.length > 0) {
        map.fitBounds(L.latLngBounds(places.map((p) => [p.lat, p.lng] as [number, number])).pad(0.2), { maxZoom: 12 });
      }
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [places, focus, router]);

  // 내 위치: 기기 안에서만 쓰고 서버로 보내지 않는다. 나와 가장 가까운 곳 3곳이 함께 보이게 맞춘다.
  useEffect(() => {
    if (!view || !me) return;
    const { L, map } = view;
    const dot = L.circleMarker([me.lat, me.lng], { radius: 6, color: "#111110", weight: 3, fillColor: "#ffffff", fillOpacity: 1 })
      .bindTooltip("내 위치", { direction: "top", offset: [0, -6] })
      .addTo(map);
    const nearest = sortByDistance(places, me).slice(0, 3);
    if (nearest.length > 0) {
      map.fitBounds(L.latLngBounds([[me.lat, me.lng], ...nearest.map((p) => [p.lat, p.lng] as [number, number])]).pad(0.25), { maxZoom: 14 });
    } else {
      map.setView([me.lat, me.lng], 12);
    }
    return () => {
      dot.remove();
    };
  }, [view, me, places]);

  return (
    <div
      ref={box}
      role="region"
      aria-label="촬영 장소 지도"
      className="isolate h-[60vh] min-h-80 w-full overflow-hidden rounded-xl border border-line bg-slot md:h-[70vh]"
    />
  );
}

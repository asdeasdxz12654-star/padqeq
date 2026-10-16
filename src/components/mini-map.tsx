"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useEffectEvent, useRef } from "react";
import { KOREA_CENTER, KOREA_ZOOM, type LatLng, pickedLatLng } from "@/lib/places/location";
import { accentColor, addOsmTiles } from "./map-tiles";

const PLACE_ZOOM = 15;

type MapState = { L: typeof Leaflet; map: Leaflet.Map; marker: Leaflet.CircleMarker | null };

/** 자리 원을 옮긴다. follow면 지도 밖일 때 그쪽으로 옮겨 간다 (입력칸에 붙여 넣은 경우). */
function drawMarker(s: MapState | null, p: LatLng | null, follow: boolean) {
  if (!s) return;
  s.marker?.remove();
  s.marker = p ? s.L.circleMarker([p.lat, p.lng], { radius: 9, color: "#fff", weight: 2, fillColor: accentColor(), fillOpacity: 0.9 }).addTo(s.map) : null;
  if (p && follow && !s.map.getBounds().contains([p.lat, p.lng])) s.map.setView([p.lat, p.lng], Math.max(s.map.getZoom(), PLACE_ZOOM));
}

/**
 * 한 곳을 보여 주는 작은 지도 (태그 · 행사 화면). onPick을 주면 지도를 눌러 자리를 고른다 (운영자 위치 설정).
 * 페이지를 내리다 지도에 걸리지 않게 휠 확대는 끄고, 보기 전용은 휴대폰에서 한 손가락 끌기도 끈다 (+ − 버튼으로 확대).
 */
export function MiniMap({ point, label, onPick }: { point: LatLng | null; label: string; onPick?: (p: LatLng) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const state = useRef<MapState | null>(null);
  const picking = Boolean(onPick);
  const pick = useEffectEvent((lat: number, lng: number) => {
    const p = pickedLatLng(lat, lng);
    if (p) onPick?.(p);
  });
  // 지도를 불러오는 사이에 바뀐 자리도 놓치지 않게 마지막 자리를 기억한다
  const latest = useRef<LatLng | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("leaflet").then(({ default: L }) => {
      if (disposed || !box.current) return;
      const start = latest.current;
      const map = L.map(box.current, {
        scrollWheelZoom: false,
        dragging: picking || !L.Browser.mobile,
        worldCopyJump: true,
      }).setView(start ? [start.lat, start.lng] : [KOREA_CENTER.lat, KOREA_CENTER.lng], start ? PLACE_ZOOM : KOREA_ZOOM);
      addOsmTiles(L, map);
      if (picking) {
        box.current.style.cursor = "crosshair";
        map.on("click", (e) => pick(e.latlng.lat, e.latlng.lng));
      }
      state.current = { L, map, marker: null };
      drawMarker(state.current, start, false);
      cleanup = () => {
        map.remove();
        state.current = null;
      };
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [picking]);

  // 자리가 바뀌면 원을 옮긴다
  const lat = point?.lat;
  const lng = point?.lng;
  useEffect(() => {
    latest.current = lat !== undefined && lng !== undefined ? { lat, lng } : null;
    drawMarker(state.current, latest.current, true);
  }, [lat, lng]);

  return (
    <div
      ref={box}
      role="region"
      aria-label={label}
      className="isolate h-56 w-full overflow-hidden rounded-xl border border-line bg-slot md:h-64"
    />
  );
}

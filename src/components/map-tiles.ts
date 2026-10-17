import type * as Leaflet from "leaflet";

/** OpenStreetMap 바탕 지도와 출처 표시. 촬영 장소 지도 · 작은 지도가 같이 쓴다. */
export function addOsmTiles(L: typeof Leaflet, map: Leaflet.Map) {
  map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    // 이 사이트는 교차 출처 격리(COEP require-corp)라 지도 조각을 CORS로 받아야 한다 (OSM은 허용)
    crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  }).addTo(map);
}

/** 지도 원 색: 그림용 빨강(로고의 해와 같은 색) */
export const accentColor = () => getComputedStyle(document.documentElement).getPropertyValue("--sun").trim() || "#e2574b";

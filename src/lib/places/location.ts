// 촬영 장소 지도 (S-04): 장소 · 행사 태그의 대략 위치. 규칙은 DB(place_map 마이그레이션)와 같다.

export type LatLng = { lat: number; lng: number };

/** 지도의 처음 화면: 대한민국 전체 */
export const KOREA_CENTER: LatLng = { lat: 36.4, lng: 127.8 };
export const KOREA_ZOOM = 7;

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/**
 * 운영자가 붙여 넣은 좌표를 읽는다. 소수점 5자리(약 1m)까지만 남긴다.
 *  · "37.5665, 126.9780" / "37.5665 126.9780"
 *  · 구글 지도 주소 (…/@37.5665,126.978,15z · ?q=37.5665,126.978)
 *  · OpenStreetMap 주소 (#map=16/37.5665/126.978)
 */
export function parseLatLng(input: string): LatLng | null {
  const text = input.trim();
  if (!text || text.length > 2000) return null;
  const num = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
  const patterns = [
    new RegExp(String.raw`#map=\d{1,2}/${num}/${num}`),
    new RegExp(String.raw`@${num},${num}`),
    new RegExp(String.raw`[?&](?:q|query|ll)=${num},\s*${num}`),
    new RegExp(String.raw`^${num}\s*[,\s]\s*${num}$`),
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      return valid(lat, lng) ? { lat: round(lat), lng: round(lng) } : null;
    }
  }
  return null;
}

/** 지도 원 크기: 게시물이 많을수록 조금 크게 (6~18px) */
export function markerRadius(posts: number): number {
  return Math.min(18, 6 + Math.round(Math.sqrt(Math.max(posts, 0)) * 2));
}

// 촬영 장소 지도 (S-04): 장소 · 행사 태그의 대략 위치. 규칙은 DB(place_map 마이그레이션)와 같다.

export type LatLng = { lat: number; lng: number };

/** 지도의 처음 화면: 대한민국 전체 */
export const KOREA_CENTER: LatLng = { lat: 36.4, lng: 127.8 };
export const KOREA_ZOOM = 7;

const valid = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
const round = (n: number) => Math.round(n * 1e5) / 1e5;

/** 지도를 눌러 고른 자리. 지도를 옆으로 돌려 경도가 ±180을 넘어도 되돌리고, 소수점 5자리까지만 남긴다. */
export function pickedLatLng(lat: number, lng: number): LatLng | null {
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return valid(lat, wrapped) ? { lat: round(lat), lng: round(wrapped) } : null;
}

/** 입력칸에 넣는 좌표 글자 */
export const formatLatLng = (p: LatLng) => `${p.lat}, ${p.lng}`;

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

/**
 * 같은 자리에 겹친 표시(예: 장소와 그 장소 위치를 쓰는 행사)를 조금씩 비켜 놓는다. 첫 번째는 그대로,
 * 나머지는 둘레 약 40m 원 위에 고르게. 눌러서 고를 수 있게 하려는 것이고, 실제 위치는 바꾸지 않는다.
 */
export function spreadOverlaps<T extends LatLng>(items: T[]): T[] {
  const groups = new Map<string, number>();
  for (const p of items) groups.set(`${p.lat},${p.lng}`, (groups.get(`${p.lat},${p.lng}`) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map((p) => {
    const key = `${p.lat},${p.lng}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n === 0) return p;
    const others = groups.get(key)! - 1;
    const angle = (2 * Math.PI * (n - 1)) / others - Math.PI / 2;
    const r = 0.0004;
    return { ...p, lat: round(p.lat + r * Math.sin(angle)), lng: round(p.lng + (r * Math.cos(angle)) / Math.cos((p.lat * Math.PI) / 180)) };
  });
}

/** 지도 원 크기: 게시물이 많을수록 조금 크게 (6~18px) */
export function markerRadius(posts: number): number {
  return Math.min(18, 6 + Math.round(Math.sqrt(Math.max(posts, 0)) * 2));
}

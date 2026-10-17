// 주소 · 장소 이름으로 지도 위치 찾기 (운영자 화면 전용). OpenStreetMap Nominatim을 서버에서 부른다.
// 이용 규칙: 1초에 1번까지 · 앱을 알리는 User-Agent · 자동 완성 금지 (버튼을 눌렀을 때만) · 출처 표시.
import { z } from "zod";
import { type LatLng, pickedLatLng } from "./location";

export type PlaceResult = LatLng & { name: string; address: string };

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "Haedam/1.0 (https://www.memories.haedam.app)";
const MAX_QUERIES = 4;
const MIN_GAP_MS = 1100;

/**
 * 검색할 글자들 (앞에서부터 차례로, 결과가 나오면 멈춘다).
 * 태그 이름은 "주소, 건물 (영문) 동관 1층 전시장"처럼 길어서 그대로는 잘 안 찾아진다.
 *  1) 넣은 그대로  2) 쉼표로 나눈 조각 (괄호 뺌)  3) 조각의 앞 두 낱말
 */
export function geocodeQueries(input: string): string[] {
  const clean = (s: string) => s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const full = input.replace(/\s+/g, " ").trim().slice(0, 200);
  if (!full) return [];
  const parts = full.split(/[,，]/).map(clean).filter(Boolean);
  const short = parts.map((p) => p.split(" ").slice(0, 2).join(" ")).filter((p) => p.length >= 2);
  return [...new Set([full, ...parts, ...short])].slice(0, MAX_QUERIES);
}

const nominatimSchema = z.array(
  z.object({
    lat: z.coerce.number(),
    lon: z.coerce.number(),
    name: z.string().optional().default(""),
    display_name: z.string(),
  }),
);

/** Nominatim 응답 → 결과 목록. 같은 자리(소수점 4자리)는 하나만. 모양이 다르면 빈 목록. */
export function parseNominatim(json: unknown): PlaceResult[] {
  const parsed = nominatimSchema.safeParse(json);
  if (!parsed.success) return [];
  const seen = new Set<string>();
  const results: PlaceResult[] = [];
  for (const row of parsed.data) {
    const point = pickedLatLng(row.lat, row.lon);
    if (!point) continue;
    const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const address = row.display_name.replace(/,\s*대한민국$/, "").slice(0, 200);
    results.push({ ...point, name: (row.name || address.split(",")[0] || "").trim().slice(0, 100), address });
  }
  return results;
}

let lastRequestAt = 0;

/** 결과가 나온 검색 글자와 결과. 못 찾거나 검색 서버가 응답하지 않으면 빈 결과. */
export async function searchPlaces(
  input: string,
  { fetchImpl = fetch, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<{ query: string; results: PlaceResult[] }> {
  for (const query of geocodeQueries(input)) {
    const gap = lastRequestAt + MIN_GAP_MS - Date.now();
    if (gap > 0) await wait(gap);
    lastRequestAt = Date.now();
    const url = `${ENDPOINT}?${new URLSearchParams({ format: "jsonv2", limit: "5", "accept-language": "ko", q: query })}`;
    const response = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`nominatim ${response.status}`);
    const results = parseNominatim(await response.json());
    if (results.length > 0) return { query, results };
  }
  return { query: "", results: [] };
}

import { findSimilarTags } from "@/lib/tags/similar";

// 운영 첫 화면 › 태그 · 지도 정리: 승인 대기 태그 · 비슷한 태그 짝 · 위치 없는 장소 · 장소 없는 행사

export type ChoreTag = { id: string; kind: string; name: string; status: "official" | "pending"; lat: number | null; aliases: string[] };
export type ChoreEvent = { place_tag_id: string | null };
export type TagChores = { pendingTags: number; similarPairs: number; placesWithoutLocation: number; eventsWithoutPlace: number };

/** 태그 관리 화면(/admin/tags)의 보기와 같은 기준으로 센다 */
export function countTagChores(tags: ChoreTag[], events: ChoreEvent[]): TagChores {
  return {
    pendingTags: tags.filter((t) => t.status === "pending").length,
    similarPairs: findSimilarTags(tags.map((t) => ({ id: t.id, kind: t.kind, name: t.name, aliases: t.aliases, posts: 0 }))).length,
    placesWithoutLocation: tags.filter((t) => t.kind === "place" && t.status === "official" && t.lat === null).length,
    eventsWithoutPlace: events.filter((e) => e.place_tag_id === null).length,
  };
}

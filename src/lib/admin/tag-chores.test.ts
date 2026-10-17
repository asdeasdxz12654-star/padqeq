import { describe, expect, it } from "vitest";
import { type ChoreTag, countTagChores } from "./tag-chores";

const tag = (id: string, kind: string, name: string, extra: Partial<ChoreTag> = {}): ChoreTag => ({ id, kind, name, status: "official", lat: null, lng: null, aliases: [], ...extra });

describe("태그 · 지도 정리 할 일", () => {
  it("지금 실제 데이터 (엑스코 태그 3개 · 대구콘페)", () => {
    const tags = [
      tag("con", "event", "대구콘페"),
      tag("both", "place", "대구광역시 북구 엑스코로 10, 대구 엑스코 (EXCO) 동관 1층 전시장"),
      tag("hall", "place", "대구 엑스코 (EXCO) 동관 1층 전시장"),
      tag("addr", "place", "대구광역시 북구 엑스코로 10"),
    ];
    expect(countTagChores(tags, [{ place_tag_id: null }])).toEqual({ pendingTags: 0, similarPairs: 3, placesWithoutLocation: 3, eventsWithoutPlace: 1 });
  });

  it("정리가 끝나면 모두 0 · 승인 대기 태그는 위치 없는 장소로 세지 않는다", () => {
    const tags = [tag("exco", "place", "대구 엑스코", { lat: 35.9 }), tag("new", "place", "새 공원", { status: "pending" })];
    expect(countTagChores(tags, [{ place_tag_id: "exco" }])).toEqual({ pendingTags: 1, similarPairs: 0, placesWithoutLocation: 0, eventsWithoutPlace: 0 });
  });
});

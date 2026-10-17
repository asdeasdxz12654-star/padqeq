import { describe, expect, it } from "vitest";
import { distanceMeters, findSimilarTags, normalizeTagName, placeWords, searchWords, similarToName, type TagForSimilarity } from "./similar";

const tag = (id: string, kind: string, name: string, posts = 0, aliases: string[] = []): TagForSimilarity => ({ id, kind, name, aliases, posts });
const ids = (pairs: ReturnType<typeof findSimilarTags>) => pairs.map((p) => `${p.keep.id}<${p.drop.id}:${p.reason}`);

describe("비슷한 태그 찾기", () => {
  it("비교용 이름은 띄어쓰기 · 괄호 · 기호 · 대소문자를 무시한다", () => {
    expect(normalizeTagName("대구 엑스코 (EXCO) 동관 1층")).toBe("대구엑스코exco동관1층");
    expect(normalizeTagName("Ｇｅｎｓｈｉｎ")).toBe("genshin");
  });

  it("실제 엑스코 태그: 주소 · 건물 이름 · 둘을 합친 이름", () => {
    const pairs = findSimilarTags([
      tag("addr", "place", "대구광역시 북구 엑스코로 10", 0),
      tag("both", "place", "대구광역시 북구 엑스코로 10, 대구 엑스코 (EXCO) 동관 1층 전시장", 0),
      tag("hall", "place", "대구 엑스코 (EXCO) 동관 1층 전시장", 1),
      tag("event", "event", "대구콘페", 1),
    ]);
    // 합친 이름은 두 태그를 모두 포함한다. 주소와 건물 이름은 '엑스코'라는 낱말이 같다 (엑스코로 → 엑스코)
    expect(ids(pairs)).toEqual(["hall<both:contains", "addr<both:contains", "hall<addr:word"]);
  });

  it("같은 이름 · 별칭이 겹치면 먼저, 종류가 다르면 짝이 아니다", () => {
    const pairs = findSimilarTags([
      tag("g1", "work", "원신", 10, ["Genshin"]),
      tag("g2", "work", "genshin impact", 2),
      tag("g3", "work", "GENSHIN", 0),
      tag("p", "place", "원신", 0),
    ]);
    expect(ids(pairs)).toEqual(["g1<g3:alias", "g1<g2:contains", "g2<g3:contains"]);
  });

  it("짧은 이름(2자 이하)이 들어 있다고 짝으로 보지 않는다", () => {
    expect(findSimilarTags([tag("a", "general", "꽃"), tag("b", "general", "꽃놀이"), tag("c", "general", "AB"), tag("d", "general", "ABC 축제")])).toEqual([]);
  });
});

describe("새 태그 만들기 전 안내", () => {
  const existing = [
    tag("hall", "place", "대구 엑스코 (EXCO) 동관 1층 전시장", 1),
    tag("addr", "place", "대구광역시 북구 엑스코로 10", 0),
    tag("event", "event", "대구콘페", 1),
    tag("g1", "work", "원신", 10, ["Genshin"]),
  ];

  it("긴 이름을 새로 만들려 하면 그 안에 든 기존 태그를 알려 준다 (실제 엑스코 사례)", () => {
    expect(similarToName("대구광역시 북구 엑스코로 10, 대구 엑스코 (EXCO) 동관 1층 전시장", existing).map((t) => `${t.id}:${t.reason}`)).toEqual([
      "hall:contains",
      "addr:contains",
    ]);
  });

  it("띄어쓰기 · 괄호만 다르거나 다른 표기로 쓴 이름", () => {
    expect(similarToName("대구엑스코 EXCO 동관1층 전시장", existing).map((t) => `${t.id}:${t.reason}`)).toEqual(["hall:same"]);
    expect(similarToName("genshin", existing).map((t) => `${t.id}:${t.reason}`)).toEqual(["g1:alias"]);
    expect(similarToName("엑스코", existing).map((t) => t.id)).toEqual(["hall", "addr"]);
    expect(similarToName("부산 벡스코", existing)).toEqual([]);
  });

  it("검색 낱말: 2자 이상, 긴 것부터 6개", () => {
    expect(searchWords("대구광역시 북구 엑스코로 10, 대구 엑스코 (EXCO) 동관 1층 전시장")).toEqual(["대구광역시", "엑스코로", "EXCO", "엑스코", "전시장", "북구"]);
    expect(searchWords("꽃")).toEqual([]);
  });
});

describe("장소: 같은 낱말 · 가까운 위치", () => {
  it("장소 낱말: 행정 구역 · 숫자 · 흔한 낱말은 빼고, 도로 이름은 뿌리만", () => {
    expect(placeWords("대구광역시 북구 엑스코로 10")).toEqual(["엑스코"]);
    expect(placeWords("대구 엑스코 (EXCO) 동관 1층 전시장")).toEqual(["엑스코", "exco"]);
    expect(placeWords("서울숲 갤러리")).toEqual(["서울숲", "갤러리"]);
    expect(placeWords("부산시 해운대구 산격동 공원")).toEqual([]);
  });

  it("남은 실제 엑스코 태그 둘이 짝으로 나온다 · 장소가 아니면 낱말로 묶지 않는다", () => {
    const pairs = findSimilarTags([
      tag("hall", "place", "대구 엑스코 (EXCO) 동관 1층 전시장", 0),
      tag("addr", "place", "대구광역시 북구 엑스코로 10", 1),
      tag("bexco", "place", "부산 벡스코 제1전시장", 0),
      tag("w1", "work", "원신 엑스코 콜라보"),
      tag("w2", "work", "엑스코 굿즈"),
    ]);
    expect(ids(pairs)).toEqual(["addr<hall:word"]);
  });

  it("지도 위치가 200m 안이면 이름이 달라도 후보", () => {
    const at = (id: string, name: string, lat: number, lng: number): TagForSimilarity => ({ ...tag(id, "place", name), lat, lng });
    expect(Math.round(distanceMeters({ lat: 35.90702, lng: 128.61311 }, { lat: 35.9086, lng: 128.6172 }))).toBe(408);
    const pairs = findSimilarTags([
      at("exco", "대구광역시 북구 엑스코로 10", 35.90702, 128.61311),
      at("gate", "동관 정문 앞 광장", 35.9078, 128.6135),
      at("far", "검단공단로", 35.9086, 128.6172),
    ]);
    expect(ids(pairs)).toEqual(["gate<exco:near"]);
  });

  it("업로드 안내: 주소로 새로 만들려 하면 건물 이름 태그를 알려 준다", () => {
    const existing = [tag("hall", "place", "대구 엑스코 (EXCO) 동관 1층 전시장", 1), tag("w", "work", "엑스코 굿즈")];
    expect(similarToName("대구광역시 북구 엑스코로 10", existing).map((t) => `${t.id}:${t.reason}`)).toEqual(["hall:word"]);
    expect(searchWords("대구광역시 북구 엑스코로 10").includes("엑스코")).toBe(false);
  });
});

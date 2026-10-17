import { describe, expect, it, vi } from "vitest";
import { geocodeQueries, parseNominatim, searchPlaces } from "./geocode";

describe("주소로 위치 찾기", () => {
  it("긴 태그 이름은 조각 · 앞 두 낱말로 나눠 차례로 찾는다 (실제 엑스코 태그)", () => {
    expect(geocodeQueries("대구광역시 북구 엑스코로 10, 대구 엑스코 (EXCO) 동관 1층 전시장")).toEqual([
      "대구광역시 북구 엑스코로 10, 대구 엑스코 (EXCO) 동관 1층 전시장",
      "대구광역시 북구 엑스코로 10",
      "대구 엑스코 동관 1층 전시장",
      "대구광역시 북구",
    ]);
    expect(geocodeQueries("대구 엑스코 (EXCO) 동관 1층 전시장")).toEqual(["대구 엑스코 (EXCO) 동관 1층 전시장", "대구 엑스코 동관 1층 전시장", "대구 엑스코"]);
    expect(geocodeQueries("  서울숲  ")).toEqual(["서울숲"]);
    expect(geocodeQueries("   ")).toEqual([]);
  });

  it("검색 결과를 읽는다: 같은 자리는 하나만, 모양이 다르면 빈 목록", () => {
    const rows = [
      { lat: "35.9068632", lon: "128.6132786", name: "엑스코", display_name: "엑스코, 유통단지로14길, 북구, 대구광역시, 41504, 대한민국" },
      { lat: "35.90686", lon: "128.61328", name: "", display_name: "엑스코 동관, 북구, 대구광역시, 대한민국" },
      { lat: "95", lon: "128", name: "잘못된 자리", display_name: "x" },
      { lat: "35.9086322", lon: "128.6172242", name: "", display_name: "검단공단로, 검단동, 북구, 대구광역시" },
    ];
    expect(parseNominatim(rows)).toEqual([
      { lat: 35.90686, lng: 128.61328, name: "엑스코", address: "엑스코, 유통단지로14길, 북구, 대구광역시, 41504" },
      { lat: 35.90863, lng: 128.61722, name: "검단공단로", address: "검단공단로, 검단동, 북구, 대구광역시" },
    ]);
    expect(parseNominatim({ error: "x" })).toEqual([]);
  });

  it("결과가 나올 때까지 차례로 찾고, 1초에 1번을 넘지 않는다", async () => {
    const asked: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const q = new URL(String(url)).searchParams.get("q")!;
      asked.push(q);
      const body = q === "대구 엑스코" ? [{ lat: "35.9", lon: "128.6", name: "엑스코", display_name: "엑스코, 대구광역시, 대한민국" }] : [];
      return new Response(JSON.stringify(body));
    });
    const wait = vi.fn(async () => {});
    const found = await searchPlaces("대구 엑스코 (EXCO) 동관 1층 전시장", { fetchImpl, wait });
    expect(asked).toEqual(["대구 엑스코 (EXCO) 동관 1층 전시장", "대구 엑스코 동관 1층 전시장", "대구 엑스코"]);
    expect(found).toEqual({ query: "대구 엑스코", results: [{ lat: 35.9, lng: 128.6, name: "엑스코", address: "엑스코, 대구광역시" }] });
    expect(wait).toHaveBeenCalled();
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(new Headers(init.headers).get("User-Agent")).toMatch(/^Haedam/);
  });
});

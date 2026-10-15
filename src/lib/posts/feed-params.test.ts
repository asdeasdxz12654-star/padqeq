import { describe, expect, it } from "vitest";
import { escapeLike, feedHref, parseCategory, parseQuery, parseSort, rankPosts } from "./feed-params";

describe("검색어", () => {
  it("제목 검색은 공백을 정리한다", () => {
    expect(parseQuery("  야간   신사 ")).toEqual({ kind: "title", text: "야간 신사" });
  });

  it("@로 시작하면 핸들 검색 (소문자)", () => {
    expect(parseQuery("@Moon_Cos")).toEqual({ kind: "handle", text: "moon_cos" });
    expect(parseQuery("@문")).toBeNull();
  });

  it("빈 값 · 배열 · 제어 문자는 무시하고 길이를 자른다", () => {
    expect(parseQuery("   ")).toBeNull();
    expect(parseQuery(["a", "b"])).toBeNull();
    expect(parseQuery("a\u0000b")).toEqual({ kind: "title", text: "ab" });
    expect(parseQuery("가".repeat(80))?.text).toHaveLength(50);
  });

  it("LIKE 특수 문자는 글자 그대로", () => {
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
  });
});

describe("카테고리 · 주소", () => {
  it("정해진 값만 받는다", () => {
    expect(parseCategory("cosplay")).toBe("cosplay");
    expect(parseCategory("video")).toBeNull();
  });

  it("다른 조건은 유지하고 바꾼 것만 반영", () => {
    const current = { year: 2025, category: "cosplay" as const, q: "신사" };
    expect(feedHref("/explore", current, { year: null })).toBe("/explore?q=%EC%8B%A0%EC%82%AC&category=cosplay");
    expect(feedHref("/", { year: null, category: null, q: null }, { year: 2024 })).toBe("/?year=2024");
    expect(feedHref("/", { year: null, category: null, q: null }, {})).toBe("/");
  });
});

describe("인기순", () => {
  it("popular만 인기순, 나머지는 최신순", () => {
    expect(parseSort("popular")).toBe("popular");
    expect(parseSort("hot")).toBe("latest");
    expect(parseSort(undefined)).toBe("latest");
  });

  it("주소에 정렬을 유지한다", () => {
    const current = { year: null, category: "cosplay" as const, q: null, sort: "popular" as const };
    expect(feedHref("/explore", current, { year: 2024 })).toBe("/explore?category=cosplay&year=2024&sort=popular");
    expect(feedHref("/explore", current, { sort: "latest" })).toBe("/explore?category=cosplay");
  });

  it("순위대로 줄 세우고 목록에 없는 글은 뺀다", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(rankPosts(rows, ["c", "x", "a"]).map((r) => r.id)).toEqual(["c", "a"]);
  });
});

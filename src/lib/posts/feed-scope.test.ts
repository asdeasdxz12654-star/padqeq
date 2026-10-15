import { describe, expect, it } from "vitest";
import { feedScopeSchema, parseHomeFeed } from "./feed-scope";
import { isUuid } from "@/lib/ids";

const ID = "00000000-0000-4000-8000-000000000001";

describe("피드 종류 (더 보기 요청 검증)", () => {
  it("정해진 모양만 받는다", () => {
    expect(feedScopeSchema.safeParse({ kind: "home", year: null, feed: "recommended" }).success).toBe(true);
    expect(feedScopeSchema.safeParse({ kind: "home", year: 2025, feed: "following" }).success).toBe(true);
    expect(feedScopeSchema.safeParse({ kind: "home", year: null, feed: "hot" }).success).toBe(false);
    expect(feedScopeSchema.safeParse({ kind: "explore", year: 2025, category: "cosplay", q: "벚꽃", sort: "popular" }).success).toBe(true);
    expect(feedScopeSchema.safeParse({ kind: "tag", tagId: ID, year: null }).success).toBe(true);
    expect(feedScopeSchema.safeParse({ kind: "credits", memberId: ID }).success).toBe(true);
  });

  it("모르는 종류 · 잘못된 값은 거절", () => {
    expect(feedScopeSchema.safeParse({ kind: "admin", year: null }).success).toBe(false);
    expect(feedScopeSchema.safeParse({ kind: "tag", tagId: "x", year: null }).success).toBe(false);
    expect(feedScopeSchema.safeParse({ kind: "explore", year: null, category: "video", q: null, sort: "latest" }).success).toBe(false);
    expect(feedScopeSchema.safeParse({ kind: "explore", year: null, category: null, q: "가".repeat(200), sort: "latest" }).success).toBe(false);
  });
});

describe("id 확인", () => {
  it("소문자 uuid만", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("fa000000-0000-4000-8000-00000000abcd".toUpperCase())).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});

describe("홈 피드 고르기", () => {
  it("기본은 추천, 팔로우는 회원만", () => {
    expect(parseHomeFeed(undefined, false)).toBe("recommended");
    expect(parseHomeFeed("latest", false)).toBe("latest");
    expect(parseHomeFeed("following", false)).toBe("recommended");
    expect(parseHomeFeed("following", true)).toBe("following");
    expect(parseHomeFeed(["latest"], true)).toBe("recommended");
  });
});

import { describe, expect, it } from "vitest";
import { busiestMonth, monthBars, yearReviewSchema } from "./year-review";

describe("year review", () => {
  it("DB 결과를 검증한다 (count는 숫자 · 문자열 모두)", () => {
    const parsed = yearReviewSchema.parse({
      year: 2026,
      posts: "3",
      photos: 4,
      months: { "4": 1, "7": 2 },
      undated: 0,
      categories: { landscape: 2 },
      top_tags: [],
      credited_in: 0,
      partners: [{ handle: "friend1", count: 2 }],
      first_post: null,
      last_post: null,
    });
    expect(parsed.posts).toBe(3);
  });

  it("월 막대는 12개, 가장 많은 달이 1", () => {
    const bars = monthBars({ "4": 1, "7": 2 });
    expect(bars).toHaveLength(12);
    expect(bars[6]).toEqual({ month: 7, count: 2, ratio: 1 });
    expect(bars[0]!.ratio).toBe(0);
  });

  it("가장 많이 담은 달", () => {
    expect(busiestMonth({ "3": 2, "9": 2 })).toBe(3);
    expect(busiestMonth({})).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { seasonOf, seasonRanges } from "./season";

describe("seasonOf", () => {
  it("달마다 계절", () => {
    expect([1, 2, 3, 5, 6, 8, 9, 11, 12].map(seasonOf)).toEqual(["winter", "winter", "spring", "spring", "summer", "summer", "autumn", "autumn", "winter"]);
  });
});

describe("seasonRanges", () => {
  it("해마다 세 달, 최근 해부터", () => {
    expect(seasonRanges("autumn", [2024, 2025, 2025])).toEqual([
      { from: "2025-09-01", to: "2025-12-01" },
      { from: "2024-09-01", to: "2024-12-01" },
    ]);
  });
  it("겨울은 다음 해 3월 전까지", () => {
    expect(seasonRanges("winter", [2025])).toEqual([{ from: "2025-12-01", to: "2026-03-01" }]);
  });
});

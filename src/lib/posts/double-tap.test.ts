import { describe, expect, it } from "vitest";
import { isDoubleTap } from "./double-tap";

describe("두 번 탭", () => {
  const first = { time: 1000, x: 100, y: 100 };

  it("가까운 시간 · 자리면 두 번 탭", () => {
    expect(isDoubleTap(first, { time: 1250, x: 110, y: 95 })).toBe(true);
  });

  it("느리거나 멀거나 처음이면 아니다", () => {
    expect(isDoubleTap(first, { time: 1400, x: 100, y: 100 })).toBe(false);
    expect(isDoubleTap(first, { time: 1100, x: 200, y: 100 })).toBe(false);
    expect(isDoubleTap(null, first)).toBe(false);
  });
});

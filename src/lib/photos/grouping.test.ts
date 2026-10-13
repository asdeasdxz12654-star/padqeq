import { describe, expect, it } from "vitest";
import { groupByShootingTime, timeRange } from "./grouping";

const at = (id: string, time: string | null) => ({ id, takenAt: time && `2026-09-14T${time}:00+09:00` });
const ids = (groups: { id: string }[][]) => groups.map((g) => g.map((i) => i.id));

describe("촬영 시각으로 묶기", () => {
  it("30분 넘게 떨어지면 나눈다 (30분 정각은 같은 묶음)", () => {
    const items = [at("a", "19:02"), at("b", "19:20"), at("c", "19:50"), at("d", "20:21"), at("e", "20:31")];
    expect(ids(groupByShootingTime(items))).toEqual([["a", "b", "c"], ["d", "e"]]);
  });

  it("고른 순서와 상관없이 시각 순으로 정렬한다", () => {
    const items = [at("late", "21:00"), at("early", "19:00"), at("mid", "19:10")];
    expect(ids(groupByShootingTime(items))).toEqual([["early", "mid"], ["late"]]);
  });

  it("한 묶음은 20장까지", () => {
    const items = Array.from({ length: 45 }, (_, i) => at(`p${i}`, `19:${String(i % 60).padStart(2, "0")}`));
    expect(groupByShootingTime(items).map((g) => g.length)).toEqual([20, 20, 5]);
  });

  it("촬영 시각이 없는 사진은 고른 순서대로 따로 묶는다", () => {
    const items = [at("x", null), at("a", "19:00"), at("y", null)];
    expect(ids(groupByShootingTime(items))).toEqual([["a"], ["x", "y"]]);
  });

  it("빈 목록", () => {
    expect(groupByShootingTime([])).toEqual([]);
  });

  it("묶음의 시간대", () => {
    expect(timeRange([at("b", "19:40"), at("a", "19:02"), at("n", null)])).toEqual({
      start: "2026-09-14T19:02:00+09:00",
      end: "2026-09-14T19:40:00+09:00",
    });
    expect(timeRange([at("n", null)])).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { foldRuns } from "./fold-runs";

const feed = (handles: string) => [...handles].map((h, i) => ({ id: `p${i}`, handle: h }));

describe("foldRuns", () => {
  it("다섯 개 이상 이어지면 세 개만 남기고 접는다", () => {
    const { visible, folds } = foldRuns(feed("aaaaaab"), new Set());
    expect(visible.map((p) => p.id)).toEqual(["p0", "p1", "p2", "p6"]);
    expect(folds.get("p2")).toEqual({ start: "p0", handle: "a", hidden: 3 });
  });
  it("짧은 묶음 · 섞인 순서는 그대로", () => {
    const { visible, folds } = foldRuns(feed("aaaabab"), new Set());
    expect(visible).toHaveLength(7);
    expect(folds.size).toBe(0);
  });
  it("펼친 묶음은 다 보인다", () => {
    const { visible, folds } = foldRuns(feed("aaaaa"), new Set(["p0"]));
    expect(visible).toHaveLength(5);
    expect(folds.size).toBe(0);
  });
});

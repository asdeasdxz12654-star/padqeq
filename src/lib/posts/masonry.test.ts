import { describe, expect, it } from "vitest";
import { masonryColumns } from "./masonry";

const ids = (cols: { item: { id: string } }[][]) => cols.map((c) => c.map((e) => e.item.id));

describe("masonryColumns", () => {
  it("같은 높이면 왼쪽부터 한 줄씩 (가로 순서)", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => ({ id, h: 1 }));
    expect(ids(masonryColumns(items, 3, (i) => i.h))).toEqual([["a", "d"], ["b", "e"], ["c"]]);
  });
  it("가장 짧은 열에 넣는다", () => {
    const items = [{ id: "tall", h: 3 }, { id: "s1", h: 1 }, { id: "s2", h: 1 }, { id: "s3", h: 1 }];
    expect(ids(masonryColumns(items, 2, (i) => i.h))).toEqual([["tall"], ["s1", "s2", "s3"]]);
  });
  it("뒤에 더해도 앞의 자리는 그대로", () => {
    const first = [{ id: "a", h: 2 }, { id: "b", h: 1 }, { id: "c", h: 1 }];
    const more = [...first, { id: "d", h: 1 }, { id: "e", h: 3 }];
    const before = ids(masonryColumns(first, 2, (i) => i.h));
    const after = ids(masonryColumns(more, 2, (i) => i.h));
    before.forEach((col, c) => expect(after[c]!.slice(0, col.length)).toEqual(col));
  });
  it("원래 순번을 함께 돌려준다", () => {
    const cols = masonryColumns([{ id: "a" }, { id: "b" }], 2, () => 1);
    expect(cols.map((c) => c.map((e) => e.index))).toEqual([[0], [1]]);
  });
});

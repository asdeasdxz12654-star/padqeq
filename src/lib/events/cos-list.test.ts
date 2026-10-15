import { describe, expect, it } from "vitest";
import { cosList } from "./cos-list";

describe("행사 코스 목록", () => {
  it("여러 캐릭터를 나누고, 같은 캐릭터는 띄어쓰기 · 대소문자와 상관없이 묶는다", () => {
    expect(
      cosList([
        { handle: "a", cosNote: "라이덴 쇼군 / 야에 미코" },
        { handle: "b", cosNote: "라이덴쇼군" },
        { handle: "c", cosNote: "Furina, 야에  미코" },
        { handle: "d", cosNote: "" },
      ]),
    ).toEqual([
      { name: "라이덴 쇼군", handles: ["a", "b"] },
      { name: "야에 미코", handles: ["a", "c"] },
      { name: "Furina", handles: ["c"] },
    ]);
  });
});

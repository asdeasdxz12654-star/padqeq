import { describe, expect, it } from "vitest";
import { addRecent, MAX_RECENT, removeRecent } from "./recent";

describe("최근 검색어", () => {
  it("맨 앞에 넣고 같은 말은 하나만 (대소문자 무시)", () => {
    expect(addRecent(["벚꽃", "Raiden"], "raiden")).toEqual(["raiden", "벚꽃"]);
  });

  it("공백 정리 · 빈 값 무시 · 개수 제한", () => {
    expect(addRecent([], "  라이덴   쇼군 ")).toEqual(["라이덴 쇼군"]);
    expect(addRecent(["a"], "   ")).toEqual(["a"]);
    const many = Array.from({ length: 10 }, (_, i) => `q${i}`);
    expect(addRecent(many, "new")).toHaveLength(MAX_RECENT);
  });

  it("하나 지우기", () => {
    expect(removeRecent(["a", "b"], "a")).toEqual(["b"]);
  });
});

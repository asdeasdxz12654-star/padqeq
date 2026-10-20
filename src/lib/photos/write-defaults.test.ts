import { describe, expect, it } from "vitest";
import { autoTitle, parseCategory, peopleByDefault, uploadHeading, veilOffered } from "./write-defaults";

describe("글쓰기 › 사진 올리기 기본값", () => {
  it("분류 주소 값은 아는 것만 받는다", () => {
    expect(parseCategory("travel")).toBe("travel");
    expect(parseCategory("casting")).toBeNull();
    expect(parseCategory(undefined)).toBeNull();
  });

  it("코스프레 · 인물만 '사람이 나와요'를 켜고 시작한다", () => {
    expect(["cosplay", "model", "landscape", "travel", "other"].map((c) => peopleByDefault(c as never))).toEqual([true, true, false, false, false]);
  });

  it("가림 표시는 코스프레 · 기타에서만", () => {
    expect(veilOffered("cosplay")).toBe(true);
    expect(veilOffered("landscape")).toBe(false);
  });

  it("화면 제목", () => {
    expect(uploadHeading("cosplay")).toBe("코스프레 사진 올리기");
    expect(uploadHeading("model")).toBe("인물 사진 올리기");
    expect(uploadHeading(null)).toBe("사진 올리기");
  });

  it("비운 제목은 첫 태그 · 촬영일, 없으면 분류 이름", () => {
    expect(autoTitle({ tagName: "라이덴 쇼군", category: "cosplay", shotOn: "2026-10-12" })).toBe("라이덴 쇼군 · 10.12");
    expect(autoTitle({ tagName: null, category: "landscape", shotOn: "2025-01-05" })).toBe("풍경 · 1.5");
    expect(autoTitle({ tagName: " ", category: "travel", shotOn: null })).toBe("여행");
  });
});

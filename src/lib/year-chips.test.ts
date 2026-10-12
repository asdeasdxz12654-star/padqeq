import { describe, expect, it } from "vitest";
import { buildYearChips, currentYearKst, parseYearParam } from "./year-chips";

// 2026-12-31 15:00 UTC = 2027-01-01 00:00 KST
const NEW_YEAR_KST = new Date("2026-12-31T15:00:00Z");
const JUST_BEFORE = new Date("2026-12-31T14:59:59Z");
const OCT_2026 = new Date("2026-10-12T03:00:00Z");

describe("currentYearKst", () => {
  it("한국 시간 1월 1일 0시에 해가 바뀐다", () => {
    expect(currentYearKst(JUST_BEFORE)).toBe(2026);
    expect(currentYearKst(NEW_YEAR_KST)).toBe(2027);
  });
});

describe("buildYearChips", () => {
  it("사진이 없어도 올해 칩은 있다", () => {
    expect(buildYearChips([], OCT_2026)).toEqual({ visible: [2026], older: [] });
  });

  it("새해가 되면 새 칩이 맨 앞에 생긴다", () => {
    expect(buildYearChips([2026, 2025], NEW_YEAR_KST).visible).toEqual([2027, 2026, 2025]);
  });

  it("4개를 넘는 오래된 연도는 '이전'으로 묶는다", () => {
    expect(buildYearChips([2025, 2024, 2023, 2022, 2019], OCT_2026)).toEqual({
      visible: [2026, 2025, 2024, 2023],
      older: [2022, 2019],
    });
  });

  it("중복·미래·범위 밖 연도는 버린다", () => {
    expect(buildYearChips([2025, 2025, 2031, 1800], OCT_2026)).toEqual({ visible: [2026, 2025], older: [] });
  });
});

describe("parseYearParam", () => {
  it("올바른 연도만 받는다", () => {
    expect(parseYearParam("2024", OCT_2026)).toBe(2024);
  });

  it.each([undefined, "", "abc", "24", "2024x", "2031", "1989", ["2024", "2025"]])(
    "잘못된 값 %j 는 전체(null)로 본다",
    (value) => {
      expect(parseYearParam(value as string | string[] | undefined, OCT_2026)).toBeNull();
    },
  );
});

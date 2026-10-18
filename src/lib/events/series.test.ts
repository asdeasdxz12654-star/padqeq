import { describe, expect, it } from "vitest";
import { seriesKey, seriesPattern } from "./series";

describe("해마다 같은 행사", () => {
  it("연도 · 회차를 빼고 견준다", () => {
    const key = seriesKey("대구 코믹월드 2026");
    expect(key).toBe("대구 코믹월드");
    expect(seriesKey("2025 대구 코믹월드")).toBe(key);
    expect(seriesKey("제12회 대구 코믹월드")).toBe(key);
    expect(seriesKey("대구 코믹월드 (2024년)")).toBe(key);
  });

  it("다른 행사는 다르게, 글자가 거의 없으면 묶지 않는다", () => {
    expect(seriesKey("부산 코믹월드 2026")).not.toBe(seriesKey("대구 코믹월드 2026"));
    expect(seriesKey("2026")).toBeNull();
  });

  it("이름 속 숫자(연도 아님)는 남긴다", () => {
    expect(seriesKey("AGF 2025")).toBe("agf");
    expect(seriesKey("C105")).toBe("c105");
  });

  it("DB 후보 무늬", () => {
    expect(seriesPattern("대구 코믹월드")).toBe("%대구%코믹월드%");
    expect(seriesPattern("100%_콘")).toBe("%100\\%\\_콘%");
  });
});

import { describe, expect, it } from "vitest";
import { capsuleOpenOn, daysUntil } from "./open-on";

describe("타임캡슐 여는 날", () => {
  it("N년 뒤 같은 날", () => {
    expect(capsuleOpenOn("2026-10-18", 1)).toBe("2027-10-18");
    expect(capsuleOpenOn("2026-10-18", 10)).toBe("2036-10-18");
  });
  it("2월 29일은 평년이면 28일", () => {
    expect(capsuleOpenOn("2028-02-29", 1)).toBe("2029-02-28");
    expect(capsuleOpenOn("2028-02-29", 4)).toBe("2032-02-29");
  });
  it("남은 날", () => {
    expect(daysUntil("2026-10-18", "2027-10-18")).toBe(365);
    expect(daysUntil("2026-10-18", "2026-10-18")).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { eventIcs, eventTagSlug, formatRange, monthGrid, parseMonth, shiftMonth } from "./calendar";

describe("달력", () => {
  it("달을 읽고 넘긴다", () => {
    const fallback = { year: 2026, month: 10 };
    expect(parseMonth("2026-11", fallback)).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13", fallback)).toEqual(fallback);
    expect(parseMonth(["2026-11"], fallback)).toEqual(fallback);
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("일요일부터 채운다 (2026년 11월 1일은 일요일)", () => {
    const grid = monthGrid({ year: 2026, month: 11 });
    expect(grid[0]![0]).toBe("2026-11-01");
    expect(grid.at(-1)!.filter(Boolean).at(-1)).toBe("2026-11-30");
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });

  it("기간을 짧게 쓴다", () => {
    expect(formatRange("2026-11-21", "2026-11-22")).toBe("11.21 – 22");
    expect(formatRange("2026-11-30", "2026-12-01")).toBe("11.30 – 12.1");
    expect(formatRange("2026-11-21", "2026-11-21")).toBe("11.21");
  });
});

describe("행사 태그 주소", () => {
  it("규칙에 맞게 만든다", () => {
    expect(eventTagSlug("서울 코믹월드 Vol.3 / 겨울", "2026-11-21")).toBe("서울-코믹월드-vol-3-겨울-2026-11");
    expect(eventTagSlug("가".repeat(80), "2026-11-21").length).toBeLessThanOrEqual(60);
  });
});

describe("캘린더 파일", () => {
  it("하루 종일 일정으로, 끝나는 날 다음 날을 DTEND로 쓴다", () => {
    const ics = eventIcs(
      { id: "e1", name: "서울, 코믹월드", starts_on: "2026-11-21", ends_on: "2026-11-22", venue: "SETEC", region: "서울", description: "가".repeat(60) },
      "https://haedam.example/events/e1",
      new Date("2026-10-14T00:00:00Z"),
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261121\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261123\r\n");
    expect(ics).toContain("SUMMARY:서울\\, 코믹월드\r\n");
    expect(ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { ageLabel, type InboxItem, rankInbox } from "./inbox-rank";

const now = new Date("2026-10-18T12:00:00Z");
const item = (key: string, hoursAgo: number, urgent = false): InboxItem => ({
  key,
  kind: "report",
  title: key,
  sub: "",
  at: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  href: "/admin/reports",
  urgent,
});

describe("처리함 순서", () => {
  it("긴급 → 주의(24시간 넘음) → 보통, 같은 단계는 오래된 것부터", () => {
    const ranked = rankInbox([item("new", 1), item("old", 30), item("urgent-new", 0.2, true), item("older", 50), item("urgent-old", 5, true)], now);
    expect(ranked.map((r) => `${r.key}:${r.level}`)).toEqual(["urgent-old:긴급", "urgent-new:긴급", "older:주의", "old:주의", "new:보통"]);
  });

  it("지난 시간 글자", () => {
    expect(ageLabel(0.2)).toBe("12분");
    expect(ageLabel(5)).toBe("5시간");
    expect(ageLabel(50)).toBe("2일");
  });
});

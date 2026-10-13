import { describe, expect, it } from "vitest";
import { queueStatus } from "./reasons";

const NOW = new Date("2026-10-13T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe("신고 처리 목표", () => {
  it("최우선 사유가 하나라도 있으면 24시간", () => {
    expect(queueStatus([{ reason: "spam", created_at: hoursAgo(2) }, { reason: "voyeurism", created_at: hoursAgo(1) }], NOW)).toMatchObject({
      urgent: true,
      targetHours: 24,
      overdue: false,
    });
  });

  it("가장 오래된 접수 기준으로 초과 여부", () => {
    const status = queueStatus([{ reason: "copyright", created_at: hoursAgo(80) }, { reason: "spam", created_at: hoursAgo(5) }], NOW);
    expect(status).toMatchObject({ urgent: false, targetHours: 72, overdue: true });
    expect(Math.round(status.elapsedHours)).toBe(80);
  });
});

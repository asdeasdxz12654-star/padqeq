import { describe, expect, it } from "vitest";
import { type Dashboard, R2_FREE_BYTES, buildTodos, formatBytes, usageLevel } from "./dashboard";

const base: Dashboard = {
  signups_today: 0,
  photos_today: 0,
  published_today: 0,
  members: 1,
  uploaders: 1,
  published: 3,
  scheduled: 0,
  trash: 0,
  photo_bytes: 0,
  suspended: 0,
  urgent_reports: 0,
  oldest_urgent_at: null,
  tomorrow_pick_empty: false,
  trash_due_week: 0,
};

describe("buildTodos", () => {
  it("할 일이 없으면 빈 목록", () => {
    expect(buildTodos(base)).toEqual([]);
  });

  it("긴급 · 주의 · 안내 순서로 만든다", () => {
    const now = Date.parse("2026-10-15T12:00:00Z");
    const todos = buildTodos(
      {
        ...base,
        urgent_reports: 2,
        oldest_urgent_at: "2026-10-15T07:30:00Z",
        tomorrow_pick_empty: true,
        trash_due_week: 1,
        photo_bytes: R2_FREE_BYTES * 0.75,
      },
      now,
    );
    expect(todos.map((t) => t.level)).toEqual(["긴급", "주의", "주의", "안내"]);
    expect(todos[0]!.text).toContain("4시간");
    expect(todos[1]!.text).toContain("75%");
  });

  it("게시물이 없으면 픽 편성은 묻지 않는다", () => {
    expect(buildTodos({ ...base, published: 0, tomorrow_pick_empty: true })).toEqual([]);
  });
});

describe("표시", () => {
  it("용량 · 사용률 단계", () => {
    expect(formatBytes(2048)).toBe("2KB");
    expect(formatBytes(5 * 1024 ** 2)).toBe("5.0MB");
    expect(formatBytes(1.5 * 1024 ** 3)).toBe("1.50GB");
    expect([0.5, 0.7, 0.95].map(usageLevel)).toEqual(["ok", "warn", "danger"]);
  });
});

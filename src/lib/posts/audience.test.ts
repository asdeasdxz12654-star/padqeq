import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleInput, toKstLocal } from "./audience";

describe("예약 시각", () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-10-14T00:00:00Z") }));
  afterEach(() => vi.useRealTimers());

  it("한국 시간으로 읽는다", () => {
    expect(scheduleInput.parse("2026-10-20T09:00")).toBe("2026-10-20T00:00:00.000Z");
  });

  it("비었거나 지난 시각이면 바로 게시", () => {
    expect(scheduleInput.parse("")).toBeNull();
    expect(scheduleInput.parse(null)).toBeNull();
    expect(scheduleInput.parse("2026-10-01T09:00")).toBeNull();
  });

  it("90일 넘게는 예약할 수 없다", () => {
    expect(scheduleInput.safeParse("2027-03-01T09:00").success).toBe(false);
    expect(scheduleInput.safeParse("내일").success).toBe(false);
  });

  it("되돌리면 같은 값", () => {
    expect(toKstLocal("2026-10-20T00:00:00.000Z")).toBe("2026-10-20T09:00");
  });
});

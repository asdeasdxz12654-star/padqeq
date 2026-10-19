import { describe, expect, it } from "vitest";
import { dayLight, dayLightFromExif, sunElevation } from "./day-light";

const kst = (iso: string) => new Date(`${iso}+09:00`);

describe("sunElevation", () => {
  it("하짓날 한낮은 높고 한밤은 낮다", () => {
    expect(sunElevation(kst("2026-06-21T12:30:00"))).toBeGreaterThan(70);
    expect(sunElevation(kst("2026-06-21T00:30:00"))).toBeLessThan(-20);
  });
});

describe("dayLight", () => {
  it("한낮 · 밤", () => {
    expect(dayLight(kst("2026-10-16T13:00:00"))).toBe("day");
    expect(dayLight(kst("2026-10-16T22:00:00"))).toBe("night");
  });
  it("해 질 녘은 골든아워, 그 뒤 잠깐 블루아워", () => {
    // 2026-10-16 한국 가운데 해넘이 ≈ 17:52, -4° ≈ 18:08, -6° ≈ 18:18
    expect(dayLight(kst("2026-10-16T17:40:00"))).toBe("golden");
    expect(dayLight(kst("2026-10-16T18:12:00"))).toBe("blue");
  });
});

describe("dayLightFromExif", () => {
  // exifr처럼 벽시계 시각을 이 컴퓨터 시간대의 Date로 만든다
  const wall = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min);
  it("시각대가 없으면 한국 시각으로 본다", () => {
    expect(dayLightFromExif(wall(2026, 10, 16, 13, 0), undefined)).toBe("day");
    expect(dayLightFromExif(wall(2026, 10, 16, 17, 40), "+09:00")).toBe("golden");
  });
  it("한국 밖 시각대 · 날짜가 아니면 나누지 않는다", () => {
    expect(dayLightFromExif(wall(2026, 10, 16, 13, 0), "+01:00")).toBeNull();
    expect(dayLightFromExif("2026:10:16 13:00:00", undefined)).toBeNull();
    expect(dayLightFromExif(null, undefined)).toBeNull();
  });
});

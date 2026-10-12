import { describe, expect, it } from "vitest";
import { ageOnKst, signupErrorFromDb, signupSchema, todayKst } from "./signup-input";

// 2026-10-12 23:30 KST = 2026-10-12 14:30 UTC
const NOW = new Date("2026-10-12T14:30:00Z");

describe("만 나이 (서울 기준)", () => {
  it("생일 전날 · 당일", () => {
    expect(ageOnKst("2012-10-13", NOW)).toBe(13);
    expect(ageOnKst("2012-10-12", NOW)).toBe(14);
  });

  it("UTC로는 전날이어도 서울 날짜로 계산", () => {
    // 2026-10-12 16:00 UTC = 2026-10-13 01:00 KST
    expect(todayKst(new Date("2026-10-12T16:00:00Z"))).toBe("2026-10-13");
    expect(ageOnKst("2012-10-13", new Date("2026-10-12T16:00:00Z"))).toBe(14);
  });

  it("2월 29일생", () => {
    expect(ageOnKst("2012-02-29", new Date("2026-02-28T03:00:00Z"))).toBe(13);
    expect(ageOnKst("2012-02-29", new Date("2026-03-01T03:00:00Z"))).toBe(14);
  });
});

describe("가입 입력", () => {
  const valid = {
    handle: "moon_cos",
    displayName: " 문 ",
    birthDate: "2000-05-05",
    agreeTerms: "on",
    agreePrivacy: "on",
  };

  it("정상 입력은 다듬어서 통과", () => {
    expect(signupSchema.parse(valid)).toMatchObject({ handle: "moon_cos", displayName: "문" });
  });

  it("동의하지 않으면 거부", () => {
    expect(signupSchema.safeParse({ ...valid, agreePrivacy: null }).success).toBe(false);
  });

  it("핸들 형식", () => {
    for (const handle of ["ab", "Moon", "문", "a-b", "a".repeat(21)]) {
      expect(signupSchema.safeParse({ ...valid, handle }).success).toBe(false);
    }
  });

  it("미래 날짜 · 잘못된 날짜 거부", () => {
    expect(signupSchema.safeParse({ ...valid, birthDate: "2999-01-01" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, birthDate: "2000-13-40" }).success).toBe(false);
  });
});

describe("DB 오류 문구", () => {
  it("필드별로 나눈다", () => {
    expect(signupErrorFromDb("handle_taken")).toMatchObject({ field: "handle" });
    expect(signupErrorFromDb("under_14")).toMatchObject({ field: "birthDate" });
    expect(signupErrorFromDb("profile_exists")).toBe("profile_exists");
    expect(signupErrorFromDb("connection reset")).toMatchObject({ field: "form" });
  });
});

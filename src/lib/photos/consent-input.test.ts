import { describe, expect, it } from "vitest";
import { consentSchema } from "./post-input";

const base = { subjectLabel: "코스어 달빛", consentedOn: "2026-10-16", hasMinor: false, guardianConsent: false };

describe("촬영 동의 기록 · 인물 SNS", () => {
  it("아이디를 주소로 바꿔 남긴다 (없으면 null)", () => {
    expect(consentSchema.parse({ ...base, subjectVia: "x", subjectId: "@moon_cos" }).subjectUrl).toBe("https://x.com/moon_cos");
    expect(consentSchema.parse(base).subjectUrl).toBeNull();
  });

  it("아이디 모양이 아니면 막는다", () => {
    expect(consentSchema.safeParse({ ...base, subjectVia: "x", subjectId: "moon.cos" }).success).toBe(false);
  });
});

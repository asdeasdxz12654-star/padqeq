import { describe, expect, it } from "vitest";
import { guideSchema, isEmptyGuide } from "./guide";

const blank = { bestTime: "", fee: "", tripod: "", parking: "", tip: "" };

describe("guideSchema", () => {
  it("앞뒤 공백을 지운다", () => {
    expect(guideSchema.parse({ ...blank, fee: "  무료 " }).fee).toBe("무료");
  });
  it("길이 · 줄바꿈을 막는다", () => {
    expect(guideSchema.safeParse({ ...blank, fee: "가".repeat(81) }).success).toBe(false);
    expect(guideSchema.safeParse({ ...blank, tip: "가".repeat(200) }).success).toBe(true);
    expect(guideSchema.safeParse({ ...blank, tip: "한 줄\n두 줄" }).success).toBe(false);
  });
  it("모두 비었는지", () => {
    expect(isEmptyGuide(blank)).toBe(true);
    expect(isEmptyGuide({ ...blank, tip: "팁" })).toBe(false);
  });
});

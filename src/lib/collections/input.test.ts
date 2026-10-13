import { describe, expect, it } from "vitest";
import { collectionSchema } from "./input";

describe("collectionSchema", () => {
  it("앞뒤 공백을 지우고 설명 줄바꿈은 둔다", () => {
    expect(collectionSchema.parse({ title: " 여름 서코 ", description: "첫째 날\n둘째 날", isPublic: true })).toEqual({
      title: "여름 서코",
      description: "첫째 날\n둘째 날",
      isPublic: true,
    });
  });

  it("빈 제목 · 긴 제목 · 제어 문자는 막는다", () => {
    expect(collectionSchema.safeParse({ title: " ", description: "", isPublic: true }).success).toBe(false);
    expect(collectionSchema.safeParse({ title: "가".repeat(61), description: "", isPublic: true }).success).toBe(false);
    expect(collectionSchema.safeParse({ title: "a\u0000", description: "", isPublic: true }).success).toBe(false);
  });
});

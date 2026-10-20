import { describe, expect, it } from "vitest";
import { boardPostSchema, castingFormSchema } from "./schema";

const base = { title: " 제목 ", body: "내용", region: null, castingKind: null, castingTerms: null, shootOn: null };

describe("boardPostSchema", () => {
  it("섭외 글은 분류 · 조건 · 지역이 필요하다", () => {
    const result = boardPostSchema.safeParse({ ...base, board: "casting" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0]).sort()).toEqual(["castingKind", "castingTerms", "region"]);
  });

  it("섭외가 아니면 섭외 칸을 버린다", () => {
    expect(boardPostSchema.parse({ ...base, board: "free", castingKind: "group", castingTerms: "tfp" })).toMatchObject({
      title: "제목",
      castingKind: null,
      castingTerms: null,
    });
  });

  it("장소 글은 지역이 필요하다", () => {
    expect(boardPostSchema.safeParse({ ...base, board: "places" }).success).toBe(false);
    expect(boardPostSchema.safeParse({ ...base, board: "places", region: "부산" }).success).toBe(true);
  });
});

describe("castingFormSchema", () => {
  it("필수 칸을 확인하고 정해진 칸만 남긴다", () => {
    expect(castingFormSchema.safeParse({ date: "11.21", place: "", terms: "TFP", usage: "SNS" }).success).toBe(false);
    expect(castingFormSchema.parse({ date: "11.21", place: "서울", terms: "TFP", usage: "SNS", extra: "x" })).toEqual({
      date: "11.21",
      place: "서울",
      concept: "",
      terms: "TFP",
      usage: "SNS",
      credit: "",
    });
  });
});

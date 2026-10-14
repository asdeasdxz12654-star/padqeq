import { describe, expect, it } from "vitest";
import { diffTags, editSchema } from "./edit-input";

const base = {
  postId: "60000000-0000-4000-8000-000000000001",
  title: " 봄 ",
  body: "줄1\n줄2",
  category: "landscape",
  shotYear: 2025,
  shotOn: "2025-04-05",
  tagIds: [],
  alts: [{ photoId: "60000000-0000-4000-8000-000000000002", altText: "벚꽃길" }],
  photoOrder: ["60000000-0000-4000-8000-000000000002"],
  visibility: "public" as const,
  commentPolicy: "everyone" as const,
  credits: { keep: [], add: [{ kind: "external", role: "model", label: "홍길동", url: "" }] },
} as const;

describe("editSchema", () => {
  it("앞뒤 공백을 지우고 줄바꿈은 둔다", () => {
    const v = editSchema.parse(base);
    expect(v.title).toBe("봄");
    expect(v.body).toBe("줄1\n줄2");
  });

  it("촬영 날짜와 연도가 다르면 막는다", () => {
    expect(editSchema.safeParse({ ...base, shotOn: "2024-04-05" }).success).toBe(false);
    expect(editSchema.safeParse({ ...base, shotOn: null }).success).toBe(true);
  });

  it("제어 문자 · 빈 제목은 막는다", () => {
    expect(editSchema.safeParse({ ...base, title: "a\u0007" }).success).toBe(false);
    expect(editSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
  });
});

describe("editSchema photos", () => {
  it("사진을 모두 빼거나 중복하면 막는다", () => {
    expect(editSchema.safeParse({ ...base, photoOrder: [] }).success).toBe(false);
    expect(editSchema.safeParse({ ...base, photoOrder: [base.photoOrder[0], base.photoOrder[0]] }).success).toBe(false);
  });
});

describe("editSchema credits", () => {
  it("남길 것 + 새로 붙일 것이 10개를 넘으면 막는다", () => {
    const keep = Array.from({ length: 10 }, (_, i) => `60000000-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`);
    expect(editSchema.safeParse({ ...base, credits: { keep, add: base.credits.add } }).success).toBe(false);
    expect(editSchema.safeParse({ ...base, credits: { keep, add: [] } }).success).toBe(true);
  });
});

describe("diffTags", () => {
  it("뗄 것과 붙일 것", () => {
    expect(diffTags(["a", "b"], ["b", "c", "c"])).toEqual({ remove: ["a"], add: ["c"] });
  });
});

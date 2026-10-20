import { describe, expect, it } from "vitest";
import { editSchema } from "./edit-input";
import { veilInput } from "./veil";
import { veilFor } from "./veil-reasons";

describe("가림 표시", () => {
  it("'바로 보기'를 켰으면 가리지 않는다", () => {
    expect(veilFor("gore", false)).toBe("gore");
    expect(veilFor("gore", true)).toBeNull();
    expect(veilFor(null, false)).toBeNull();
  });

  it("입력: 없으면 null, 정해진 사유만", () => {
    expect(veilInput.parse(undefined)).toBeNull();
    expect(veilInput.parse("fear")).toBe("fear");
    expect(veilInput.safeParse("nsfw").success).toBe(false);
  });

  it("편집에서 보내지 않으면 그대로 둔다 (운영자가 붙인 가림)", () => {
    const base = {
      postId: "00000000-0000-4000-8000-000000000001",
      title: "제목",
      body: "",
      category: "cosplay",
      shotYear: 2025,
      shotOn: null,
      tagIds: [],
      alts: [],
      photoOrder: ["00000000-0000-4000-8000-000000000002"],
      credits: { keep: [], add: [] },
      visibility: "public",
      commentPolicy: "everyone",
    } as const;
    expect(editSchema.parse(base).veil).toBeUndefined();
    expect(editSchema.parse({ ...base, veil: null }).veil).toBeNull();
    expect(editSchema.parse({ ...base, veil: "phobia" }).veil).toBe("phobia");
  });
});

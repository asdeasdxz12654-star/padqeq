import { describe, expect, it } from "vitest";
import { LIMIT_ORDER, limitErrorMessage, limitSchema } from "./limits";

describe("한도 값", () => {
  it("알려진 항목만, 사유와 함께", () => {
    expect(LIMIT_ORDER).toContain("monthly_upload_photos");
    expect(limitSchema.safeParse({ key: "report_daily", value: 10, note: "폭주" }).success).toBe(true);
    expect(limitSchema.safeParse({ key: "nope", value: 10, note: "x" }).success).toBe(false);
    expect(limitSchema.safeParse({ key: "report_daily", value: 10, note: " " }).success).toBe(false);
  });

  it("DB 오류를 문구로", () => {
    expect(limitErrorMessage("limit_out_of_range")).toBe("허용 범위를 벗어났어요.");
    expect(limitErrorMessage(undefined)).toBe("바꾸지 못했어요.");
  });
});

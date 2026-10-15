import { describe, expect, it } from "vitest";
import { availableActions, daysLabel, sanctionErrorMessage, sanctionSchema } from "./sanctions";

const memberId = "00000000-0000-4000-8000-000000000001";

describe("sanctionSchema", () => {
  it("정지는 기간과 회원에게 보여 줄 사유가 필요하다", () => {
    const result = sanctionSchema.safeParse({ memberId, action: "suspend", note: "메모", days: null, reason: " " });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path[0])).toEqual(["days", "reason"]);
  });

  it("정지가 아니면 기간 · 사유를 버린다", () => {
    const result = sanctionSchema.parse({ memberId, action: "revoke_upload", note: " 메모 ", days: 7, reason: "x" });
    expect(result).toEqual({ memberId, action: "revoke_upload", note: "메모", days: null, reason: null });
  });

  it("경고는 사유가 필요하고 기간은 버린다", () => {
    expect(sanctionSchema.safeParse({ memberId, action: "warn", note: "메모", days: null, reason: "" }).success).toBe(false);
    expect(sanctionSchema.parse({ memberId, action: "warn", note: "메모", days: 7, reason: " 반복 " })).toEqual({
      memberId,
      action: "warn",
      note: "메모",
      days: null,
      reason: "반복",
    });
  });

  it("내부 메모는 꼭 적는다", () => {
    expect(sanctionSchema.safeParse({ memberId, action: "lift", note: "  ", days: null, reason: null }).success).toBe(false);
  });
});

describe("availableActions", () => {
  it("상태에 맞는 조치만 보여 준다", () => {
    expect(availableActions({ canUpload: true, suspended: false })).toEqual(["warn", "suspend", "revoke_upload"]);
    expect(availableActions({ canUpload: false, suspended: true })).toEqual(["lift", "warn", "suspend", "grant_upload"]);
  });
});

describe("문구", () => {
  it("기간 · 오류를 읽기 쉽게 바꾼다", () => {
    expect([1, 365, 3650].map(daysLabel)).toEqual(["1일", "1년", "무기한"]);
    expect(sanctionErrorMessage('Error: target_admin')).toBe("운영자 계정은 제재할 수 없어요.");
    expect(sanctionErrorMessage(undefined)).toBe("처리하지 못했어요.");
  });
});

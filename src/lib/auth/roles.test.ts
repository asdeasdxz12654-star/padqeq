import { describe, expect, it } from "vitest";
import { isStaffRole, roleErrorMessage, roleSchema } from "./roles";

describe("운영 역할", () => {
  it("최고 관리자 · 운영 도우미만 운영진", () => {
    expect(isStaffRole("admin")).toBe(true);
    expect(isStaffRole("moderator")).toBe(true);
    expect(isStaffRole("member")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });

  it("회원 ↔ 운영 도우미만 지정, 사유 필수", () => {
    const memberId = "00000000-0000-4000-8000-000000000001";
    expect(roleSchema.safeParse({ memberId, role: "moderator", note: "신고 담당" }).success).toBe(true);
    expect(roleSchema.safeParse({ memberId, role: "admin", note: "x" }).success).toBe(false);
    expect(roleSchema.safeParse({ memberId, role: "member", note: " " }).success).toBe(false);
  });

  it("DB 오류를 문구로", () => {
    expect(roleErrorMessage("cannot_change_admin")).toBe("최고 관리자의 역할은 여기서 바꿀 수 없어요.");
    expect(roleErrorMessage(undefined)).toBe("역할을 바꾸지 못했어요.");
  });
});

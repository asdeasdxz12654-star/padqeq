import { describe, expect, it } from "vitest";
import { auditActionLabel, auditSummary, auditTargetHref } from "./audit";

describe("감사 로그 표시", () => {
  it("행동 이름에 세부 조치를 붙인다", () => {
    expect(auditActionLabel("sanction", { action: "warn" })).toBe("회원 제재 · 경고");
    expect(auditActionLabel("moderation", { decision: "hide" })).toBe("신고 · 게시물 조치 · 게시 중단");
    expect(auditActionLabel("something_new", {})).toBe("something_new");
  });

  it("요약은 제목 · 사유 · 메모 순서, 나머지 키는 그대로", () => {
    expect(auditSummary({ title: "야간", note: "중복", from: "published" })).toBe("「야간」 · 메모: 중복 · from: published");
    expect(auditSummary({ note: "auto:trash_30d" })).toBe("메모: 자동 정리");
    expect(auditSummary(null)).toBe("");
  });

  it("대상 링크", () => {
    expect(auditTargetHref("profiles", "abc")).toBe("/admin/members/abc");
    expect(auditTargetHref("comments", "abc")).toBeNull();
  });
});

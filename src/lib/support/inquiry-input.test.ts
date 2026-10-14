import { describe, expect, it } from "vitest";
import { inquirySchema, noticeSchema } from "./inquiry-input";
import { switchBannerText } from "./labels";

const notice = { id: null, category: "news" as const, title: " 오픈 ", body: "반가워요", maintenanceAt: "2026-11-01T03:00", pinned: false };

describe("noticeSchema", () => {
  it("점검이 아니면 점검 시각을 버린다", () => {
    expect(noticeSchema.parse(notice)).toMatchObject({ title: "오픈", maintenanceAt: null });
  });

  it("점검 시각은 한국 시간으로 읽는다", () => {
    expect(noticeSchema.parse({ ...notice, category: "maintenance" }).maintenanceAt).toBe("2026-10-31T18:00:00.000Z");
    expect(noticeSchema.safeParse({ ...notice, category: "maintenance", maintenanceAt: null }).success).toBe(false);
  });
});

describe("inquirySchema", () => {
  it("이상한 오류 번호는 버리고 문의는 받는다", () => {
    expect(inquirySchema.parse({ category: "other", body: "안녕하세요 문의", errorRef: "<script>" }).errorRef).toBeNull();
    expect(inquirySchema.parse({ category: "other", body: "안녕하세요 문의", errorRef: "12345" }).errorRef).toBe("12345");
  });
});

describe("switchBannerText", () => {
  const off = { readOnly: false, signupClosed: false, uploadsClosed: false, message: "", uploadStage: "solo" as const };
  it("켜진 스위치가 있을 때만 문구를 보여 준다", () => {
    expect(switchBannerText(off)).toBeNull();
    expect(switchBannerText({ ...off, message: "남은 문구" })).toBeNull();
    expect(switchBannerText({ ...off, readOnly: true })).toMatch(/보기만/);
    expect(switchBannerText({ ...off, uploadsClosed: true, message: "점검 중" })).toBe("점검 중");
  });
});

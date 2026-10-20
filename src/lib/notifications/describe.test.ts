import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/supabase/database.types";
import { describeNotification, notificationGroup, timeBucket } from "./describe";

const post = { id: "60000000-0000-4000-8000-000000000001", title: "봄 벚꽃" };

describe("describeNotification", () => {
  it("모든 알림 종류에 문구가 있다", () => {
    for (const kind of Constants.public.Enums.notification_kind) {
      expect(describeNotification({ kind, actorHandle: "model1", post }).text.length).toBeGreaterThan(0);
    }
  });

  it("크레딧 요청은 승인하는 곳(마이)으로 보낸다", () => {
    expect(describeNotification({ kind: "credit_requested", actorHandle: "author1", post })).toEqual({
      text: "@author1님이 나를 크레딧으로 태그했어요. 승인하면 내 프로필에 보여요.",
      href: "/me#credit-requests",
    });
  });

  it("행사 끝난 뒤 알림은 행사 태그가 붙은 업로드 화면으로", () => {
    const id = "25a97515-d5af-4c8e-96ef-eee5a86a2e82";
    expect(describeNotification({ kind: "event_photos", actorHandle: null, post: null, event: { id, name: "대구콘페" } }).href).toBe(`/upload?event=${id}`);
    expect(describeNotification({ kind: "event_photos", actorHandle: null, post: null, event: null }).href).toBe("/upload");
    expect(notificationGroup("event_photos")).toBe("community");
  });

  it("게시물로 연결한다", () => {
    expect(describeNotification({ kind: "post_held", actorHandle: null, post }).href).toBe(`/p/${post.id}`);
  });

  it("볼 수 없는 게시물 · 탈퇴한 상대는 이름 없이 표시하고 링크하지 않는다", () => {
    expect(describeNotification({ kind: "report_reviewed", actorHandle: null, post: null }).href).toBeNull();
    expect(describeNotification({ kind: "credit_approved", actorHandle: null, post }).text).toMatch(/^회원이/);
  });
});

describe("알림 묶기", () => {
  it("같은 글 좋아요는 '외 N명'으로 모은다", () => {
    expect(describeNotification({ kind: "post_liked", actorHandle: "a", post, others: 2 }).text).toBe("@a님 외 2명이 내 게시물을 좋아해요.");
    expect(describeNotification({ kind: "post_liked", actorHandle: "a", post }).text).toBe("@a님이 내 게시물을 좋아해요.");
  });

  it("종류별로 나눈다", () => {
    expect(notificationGroup("credit_requested")).toBe("credit");
    expect(notificationGroup("post_liked")).toBe("reaction");
    expect(notificationGroup("message_received")).toBe("community");
    expect(notificationGroup("post_hidden")).toBe("ops");
  });

  it("오늘 · 이번 주 · 이전 (한국 날짜)", () => {
    const now = new Date("2026-10-15T03:00:00Z"); // 10월 15일 낮 12시 (한국)
    expect(timeBucket("2026-10-14T16:00:00Z", now)).toBe("오늘"); // 10월 15일 새벽 1시 (한국)
    expect(timeBucket("2026-10-14T14:00:00Z", now)).toBe("이번 주");
    expect(timeBucket("2026-10-01T00:00:00Z", now)).toBe("이전");
  });
});

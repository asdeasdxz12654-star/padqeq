import { describe, expect, it } from "vitest";
import { Constants } from "@/lib/supabase/database.types";
import { describeNotification } from "./describe";

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

  it("게시물로 연결한다", () => {
    expect(describeNotification({ kind: "post_held", actorHandle: null, post }).href).toBe(`/p/${post.id}`);
  });

  it("볼 수 없는 게시물 · 탈퇴한 상대는 이름 없이 표시하고 링크하지 않는다", () => {
    expect(describeNotification({ kind: "report_reviewed", actorHandle: null, post: null }).href).toBeNull();
    expect(describeNotification({ kind: "credit_approved", actorHandle: null, post }).text).toMatch(/^회원이/);
  });
});

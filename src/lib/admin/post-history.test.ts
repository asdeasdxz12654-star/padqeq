import { describe, expect, it } from "vitest";
import { buildPostHistory, type PostHistoryInput } from "./post-history";

const base: PostHistoryInput = {
  post: {
    created_at: "2026-10-01T00:00:00Z",
    published_at: "2026-10-01T00:00:30Z",
    updated_at: "2026-10-01T00:00:30Z",
    scheduled_at: null,
    trashed_at: null,
    quarantined_at: null,
  },
  photos: [{ created_at: "2026-10-01T00:00:00Z" }],
  credits: [],
  reports: [],
  appeals: [],
  picks: [],
  audit: [],
};

describe("게시물 처리 이력", () => {
  it("업로드 · 게시만 있으면 두 줄, 새것이 위", () => {
    expect(buildPostHistory(base).map((e) => e.title)).toEqual(["게시", "업로드 (초안)"]);
  });

  it("나중에 붙인 사진 · 수정 · 신고 · 조치 · 소명을 시간순으로", () => {
    const events = buildPostHistory({
      ...base,
      post: { ...base.post, updated_at: "2026-10-03T00:00:00Z" },
      photos: [...base.photos, { created_at: "2026-10-02T10:00:00Z" }, { created_at: "2026-10-02T10:00:20Z" }],
      reports: [{ created_at: "2026-10-04T00:00:00Z", resolved_at: "2026-10-05T00:00:00Z", reason: "portrait_rights", status: "actioned", reporter: "fan1" }],
      appeals: [{ created_at: "2026-10-06T00:00:00Z", resolved_at: null, status: "open" }],
      audit: [{ created_at: "2026-10-05T00:00:00Z", action: "moderation", detail: { decision: "hide", note: "본인 요청" }, actor_handle: "wolf1" }],
    });
    expect(events.map((e) => e.title)).toEqual([
      "소명 접수",
      "신고 처리 · 조치됨",
      "신고 · 게시물 조치 · 게시 중단",
      "신고 · 내 사진이 동의 없이 올라옴",
      "마지막 수정",
      "사진 2장 추가",
      "게시",
      "업로드 (초안)",
    ]);
    expect(events.find((e) => e.title.includes("게시 중단"))).toMatchObject({ who: "wolf1", tone: "danger", detail: "메모: 본인 요청" });
  });

  it("예약 게시와 오늘의 픽", () => {
    const events = buildPostHistory({
      ...base,
      post: { ...base.post, scheduled_at: "2026-10-02T00:00:00Z", published_at: "2026-10-02T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" },
      picks: [{ pick_date: "2026-10-03" }],
    });
    expect(events.map((e) => e.title)).toEqual(["오늘의 픽", "예약 게시", "업로드 (초안)"]);
  });
});

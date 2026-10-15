import { describe, expect, it } from "vitest";
import { PURGE_CONFIRM, bulkSchema, postStateLabel, purgeDate } from "./post-bulk";

const id = "00000000-0000-4000-8000-000000000001";

describe("bulkSchema", () => {
  it("사유와 대상이 필요하다", () => {
    expect(bulkSchema.safeParse({ ids: [], action: "trash", note: "x" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: [id], action: "trash", note: " " }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: [id], action: "trash", note: "중복" }).success).toBe(true);
  });

  it("영구 삭제는 확인 문구를 그대로 입력해야 한다", () => {
    expect(bulkSchema.safeParse({ ids: [id], action: "purge", note: "x", confirm: "삭제" }).success).toBe(false);
    expect(bulkSchema.safeParse({ ids: [id], action: "purge", note: "x", confirm: PURGE_CONFIRM }).success).toBe(true);
  });
});

describe("표시", () => {
  const base = { status: "published" as const, held_at: null, removed_at: null, trashed_at: null, scheduled_at: null };
  it("상태 이름", () => {
    const now = Date.parse("2026-10-15T00:00:00Z");
    expect(postStateLabel(base, now)).toBe("게시됨");
    expect(postStateLabel({ ...base, scheduled_at: "2026-10-20T00:00:00Z" }, now)).toBe("예약");
    expect(postStateLabel({ ...base, status: "hidden", removed_at: "x" }, now)).toBe("게시 중단");
    expect(postStateLabel({ ...base, status: "hidden" }, now)).toBe("숨김");
    expect(postStateLabel({ ...base, trashed_at: "x" }, now)).toBe("휴지통");
    expect(postStateLabel({ ...base, trashed_at: "x", quarantined_at: "x" }, now)).toBe("격리");
  });

  it("영구 삭제 예정일은 30일 뒤", () => {
    expect(purgeDate("2026-10-01T00:00:00Z").toISOString()).toBe("2026-10-31T00:00:00.000Z");
  });
});

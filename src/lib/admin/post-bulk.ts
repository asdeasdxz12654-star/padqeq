import { z } from "zod";

// 게시물 일괄 작업 (A-03 ③). 실제 규칙(운영자만 · 상태 확인 · 감사 로그)은 DB 함수 admin_posts_action이 다시 확인한다.

export const BULK_ACTIONS = ["hide", "restore", "trash", "untrash", "purge", "quarantine", "unquarantine"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const BULK_LABEL: Record<BulkAction, { label: string; help: string; danger?: boolean }> = {
  hide: { label: "게시 중단", help: "게시된 글만 바로 비공개로 돌려요. 작성자에게 알림이 가고 소명할 수 있어요." },
  restore: { label: "게시 중단 해제", help: "운영자가 게시 중단한 글을 다시 게시해요." },
  trash: { label: "휴지통으로", help: "작성자를 포함해 아무도 못 봐요. 30일 안에 복구할 수 있고, 지나면 영구 삭제돼요." },
  untrash: { label: "복구", help: "휴지통에 넣기 전 상태로 돌려요." },
  purge: { label: "영구 삭제", help: "사진 파일까지 지워져 되돌릴 수 없어요. 격리한 글은 지울 수 없어요.", danger: true },
  quarantine: {
    label: "불법 촬영물 격리",
    help: "아무도 못 보게 하고 같은 사진을 다시 못 올리게 해요. 원본은 수사 협조를 위해 보존돼 자동 삭제 · 복구 · 영구 삭제가 막혀요.",
    danger: true,
  },
  unquarantine: { label: "격리 해제", help: "휴지통에 남고, 30일 뒤 영구 삭제 기간을 지금부터 다시 세요." },
};

/** 영구 삭제 확인 문구 (직접 입력, A-00 실수 방지) */
export const PURGE_CONFIRM = "영구 삭제";

export const bulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1, "게시물을 골라 주세요.").max(100, "한 번에 100개까지 처리할 수 있어요."),
    action: z.enum(BULK_ACTIONS),
    note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
    confirm: z.string().optional(),
  })
  .refine((v) => v.action !== "purge" || v.confirm === PURGE_CONFIRM, {
    path: ["confirm"],
    message: `영구 삭제하려면 '${PURGE_CONFIRM}'을 그대로 입력해 주세요.`,
  });

/** 휴지통에 넣은 지 30일이 되는 날 (영구 삭제 예정일) */
export const purgeDate = (trashedAt: string) => new Date(Date.parse(trashedAt) + 30 * 86_400_000);

/** 목록 상태 표시 */
export function postStateLabel(p: {
  status: "draft" | "published" | "hidden";
  held_at: string | null;
  removed_at: string | null;
  trashed_at: string | null;
  scheduled_at: string | null;
  quarantined_at?: string | null;
}, now: number = Date.now()): string {
  if (p.quarantined_at) return "격리";
  if (p.trashed_at) return "휴지통";
  if (p.held_at) return "임시 비공개";
  if (p.status === "hidden") return p.removed_at ? "게시 중단" : "숨김";
  if (p.status === "draft") return "임시저장";
  if (p.scheduled_at && Date.parse(p.scheduled_at) > now) return "예약";
  return "게시됨";
}

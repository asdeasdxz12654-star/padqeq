import { z } from "zod";

// 회원 제재 (A-05). 실제 규칙(운영자만 · 운영자 제외 · 기간 · 사유)은 DB 함수 sanction_member가 다시 확인한다.

// 단계: 경고 → 업로드 권한 회수 → 기간 정지 → 무기한 정지 (A-05 ⑥)
export const SANCTION_ACTIONS = ["warn", "suspend", "lift", "revoke_upload", "grant_upload"] as const;
export type SanctionAction = (typeof SANCTION_ACTIONS)[number];

export const SANCTION_LABEL: Record<SanctionAction, { label: string; help: string }> = {
  warn: { label: "경고", help: "사유와 함께 알림이 가고, 회원 설정에 기록이 남아요. 이용은 그대로예요." },
  suspend: { label: "이용 정지", help: "기간 동안 올리기 · 수정 · 신고 · 컬렉션이 막혀요. 다시 하면 새 기간으로 바뀌어요." },
  lift: { label: "정지 해제", help: "남은 기간과 상관없이 바로 풀어요." },
  revoke_upload: { label: "업로드 권한 회수", help: "이미 올린 게시물은 그대로 두고, 새로 올리지 못하게 해요." },
  grant_upload: { label: "업로드 권한 주기", help: "사진을 올릴 수 있게 해요 (초대)." },
};

/** 정지 기간 (일). 3650일은 '무기한'으로 보여 준다. */
export const SUSPEND_DAYS = [1, 3, 7, 30, 90, 365, 3650] as const;
export const daysLabel = (days: number) => (days >= 3650 ? "무기한" : days >= 365 ? `${days / 365}년` : `${days}일`);

/** 지금 상태에서 고를 수 있는 조치 */
export function availableActions(state: { canUpload: boolean; suspended: boolean }): SanctionAction[] {
  return [
    state.suspended ? "lift" : null,
    "warn",
    "suspend",
    state.canUpload ? "revoke_upload" : "grant_upload",
  ].filter((a): a is SanctionAction => a !== null);
}

export const sanctionSchema = z
  .object({
    memberId: z.uuid(),
    action: z.enum(SANCTION_ACTIONS),
    note: z.string().trim().min(1, "처리 사유를 적어 주세요.").max(500),
    days: z.number().int().min(1).max(3650).nullable(),
    reason: z.string().trim().max(200).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.action !== "suspend" && v.action !== "warn") return;
    if (v.action === "suspend" && v.days === null) ctx.addIssue({ code: "custom", path: ["days"], message: "정지 기간을 골라 주세요." });
    if (!v.reason) ctx.addIssue({ code: "custom", path: ["reason"], message: "회원에게 보여 줄 사유를 적어 주세요." });
  })
  .transform((v) =>
    v.action === "suspend" ? v : v.action === "warn" ? { ...v, days: null } : { ...v, days: null, reason: null },
  );

const DB_ERRORS: Record<string, string> = {
  target_admin: "운영자 계정은 제재할 수 없어요.",
  not_suspended: "정지 중인 회원이 아니에요.",
  no_change: "이미 그 상태예요.",
  member_not_found: "회원을 찾지 못했어요.",
};

/** DB 함수의 오류 코드를 화면 문구로 */
export function sanctionErrorMessage(message: string | undefined): string {
  const key = Object.keys(DB_ERRORS).find((k) => message?.includes(k));
  return key ? DB_ERRORS[key]! : "처리하지 못했어요.";
}

/** 정지가 아직 유효한지 (기간이 지난 행은 DB에서도 효력이 없고 매일 지워진다) */
export const isActiveRestriction = (until: string, now: number = Date.now()) => Date.parse(until) > now;

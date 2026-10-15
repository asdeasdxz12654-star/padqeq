import { z } from "zod";

// 운영 역할 (A-05). 실제 권한은 DB(private.is_admin · private.is_staff)가 다시 확인한다.
//  · 최고 관리자(admin): 모든 운영 기능. DB 콘솔에서만 정한다.
//  · 운영 도우미(moderator): 신고 처리 · 불법 촬영물 격리 · 일반 회원 경고
//  · 둘 다 2단계 인증 세션에서만

export type MemberRole = "member" | "moderator" | "admin";

export const ROLE_LABEL: Record<MemberRole, string> = { member: "회원", moderator: "운영 도우미", admin: "최고 관리자" };

export const isStaffRole = (role: string | null | undefined): role is "admin" | "moderator" => role === "admin" || role === "moderator";

/** 최고 관리자가 지정할 수 있는 역할 */
export const ASSIGNABLE_ROLES = ["member", "moderator"] as const;

export const roleSchema = z.object({
  memberId: z.uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
  note: z.string().trim().min(1, "바꾸는 이유를 적어 주세요.").max(500),
});

const DB_ERRORS: Record<string, string> = {
  cannot_change_self: "내 역할은 바꿀 수 없어요.",
  cannot_change_admin: "최고 관리자의 역할은 여기서 바꿀 수 없어요.",
  no_change: "지금 역할과 같아요.",
  member_not_found: "회원을 찾지 못했어요.",
};

export function roleErrorMessage(message: string | undefined): string {
  const key = Object.keys(DB_ERRORS).find((k) => message?.includes(k));
  return key ? DB_ERRORS[key]! : "역할을 바꾸지 못했어요.";
}

import type { Database } from "@/lib/supabase/database.types";

export type NotificationKind = Database["public"]["Enums"]["notification_kind"];

export type NotificationInput = {
  kind: NotificationKind;
  /** 상대 핸들. 탈퇴했거나 볼 수 없으면 null */
  actorHandle: string | null;
  /** 게시물. 지워졌거나 받는 사람이 볼 수 없으면 null */
  post: { id: string; title: string } | null;
};

/**
 * 알림 문구와 눌렀을 때 갈 곳. 문구는 DB가 아니라 여기서만 정한다.
 * 게시물 제목은 받침에 따라 조사가 달라지므로 문장에 넣지 않고 화면에서 따로 보여 준다.
 */
export function describeNotification({ kind, actorHandle, post }: NotificationInput): { text: string; href: string | null } {
  const who = actorHandle ? `@${actorHandle}님` : "회원";
  const postHref = post ? `/p/${post.id}` : null;

  switch (kind) {
    case "credit_requested":
      // 승인 · 거절은 마이 화면에서
      return { text: `${who}이 나를 크레딧으로 태그했어요. 승인하면 내 프로필에 보여요.`, href: "/me#credit-requests" };
    case "credit_approved":
      return { text: `${who}이 크레딧을 승인했어요.`, href: postHref };
    case "credit_rejected":
      return { text: `${who}이 크레딧을 거절했어요.`, href: postHref };
    case "post_held":
      return { text: "신고 검토를 위해 내 게시물이 임시 비공개됐어요. 게시물 화면에서 소명할 수 있어요.", href: postHref };
    case "post_released":
      return { text: "임시 비공개가 풀려 내 게시물이 다시 공개됐어요.", href: postHref };
    case "post_hidden":
      return { text: "운영 정책에 따라 내 게시물이 게시 중단됐어요. 게시물 화면에서 소명할 수 있어요.", href: postHref };
    case "post_restored":
      return { text: "검토 결과 내 게시물이 다시 게시됐어요.", href: postHref };
    case "appeal_rejected":
      return { text: "소명을 검토했지만 조치를 유지하기로 했어요. 게시물 화면에서 자세히 볼 수 있어요.", href: postHref };
    case "credit_claimed":
      return { text: `${who}이 미가입자로 적힌 크레딧이 자기라고 연결을 요청했어요. 마이에서 확인해 주세요.`, href: "/me#credit-claims" };
    case "credit_claim_approved":
      return { text: `${who}이 크레딧 연결을 승인했어요. 이제 내 프로필에 보여요.`, href: postHref };
    case "credit_claim_rejected":
      return { text: `${who}이 크레딧 연결 요청을 거절했어요.`, href: postHref };
    case "member_suspended":
      return { text: "운영 정책에 따라 이용이 일시 제한됐어요. 기간과 사유는 마이에서 볼 수 있어요.", href: "/me" };
    case "suspension_lifted":
      return { text: "이용 제한이 풀렸어요. 다시 모든 기능을 쓸 수 있어요.", href: "/me" };
    case "upload_granted":
      return { text: "사진을 올릴 수 있게 됐어요. 반가워요!", href: "/upload" };
    case "upload_revoked":
      return { text: "운영 정책에 따라 사진 올리기 권한이 회수됐어요. 이미 올린 사진은 그대로예요.", href: "/me" };
    case "report_reviewed":
      return { text: "신고하신 게시물을 검토했어요. 알려 주셔서 고마워요.", href: postHref };
  }
}

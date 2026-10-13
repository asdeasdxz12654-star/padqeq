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
      return { text: "신고 검토를 위해 내 게시물이 임시 비공개됐어요. 검토가 끝나면 알려 드릴게요.", href: postHref };
    case "post_released":
      return { text: "임시 비공개가 풀려 내 게시물이 다시 공개됐어요.", href: postHref };
    case "post_hidden":
      return { text: "운영 정책에 따라 내 게시물이 게시 중단됐어요.", href: postHref };
    case "report_reviewed":
      return { text: "신고하신 게시물을 검토했어요. 알려 주셔서 고마워요.", href: postHref };
  }
}

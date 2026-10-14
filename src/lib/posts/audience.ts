import { z } from "zod";

// 게시물 공개 범위 · 댓글 설정 · 예약 게시 (S-08 ⑪ · A-02 ⑧ · P-04). 규칙은 DB(post_visibility 마이그레이션)와 같다.

export const VISIBILITIES = ["public", "followers", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const COMMENT_POLICIES = ["everyone", "followers", "off"] as const;
export type CommentPolicy = (typeof COMMENT_POLICIES)[number];

export const VISIBILITY_LABEL: Record<Visibility, { title: string; help: string }> = {
  public: { title: "전체", help: "누구나 볼 수 있어요." },
  followers: { title: "팔로워", help: "나를 팔로우하는 회원만 봐요." },
  private: { title: "나만 보기", help: "나와 운영자만 봐요. 추억을 담아 두기만 할 때." },
};

export const COMMENT_POLICY_LABEL: Record<CommentPolicy, string> = {
  everyone: "모두 댓글 가능",
  followers: "팔로워만 댓글",
  off: "댓글 끄기",
};

/** 예약은 90일 안까지 (DB와 같게) */
export const MAX_SCHEDULE_DAYS = 90;

/** datetime-local 값(한국 시간 "YYYY-MM-DDTHH:mm") → ISO. 비었으면 null */
export const scheduleInput = z
  .string()
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
      ctx.addIssue({ code: "custom", message: "예약 시각을 확인해 주세요." });
      return z.NEVER;
    }
    const at = Date.parse(`${value}:00+09:00`);
    if (Number.isNaN(at) || at > Date.now() + MAX_SCHEDULE_DAYS * 86_400_000) {
      ctx.addIssue({ code: "custom", message: `예약은 ${MAX_SCHEDULE_DAYS}일 안까지 할 수 있어요.` });
      return z.NEVER;
    }
    // 이미 지난 시각이면 바로 게시
    return at <= Date.now() ? null : new Date(at).toISOString();
  });

/** ISO → datetime-local 값 (한국 시간) */
export function toKstLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(Date.parse(iso) + 9 * 3_600_000).toISOString().slice(0, 16);
}

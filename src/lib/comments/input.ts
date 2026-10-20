import { z } from "zod";
import { COMMENT_MAX } from "./limits";

export { COMMENT_REPORT_REASONS } from "./limits";

export const commentBody = z.string().trim().min(1, "댓글을 적어 주세요.").max(COMMENT_MAX, `${COMMENT_MAX}자까지 적을 수 있어요.`);

export function commentErrorMessage(message: string | undefined): string {
  if (message?.includes("banned_word")) return "쓸 수 없는 말이 들어 있어요.";
  if (message?.includes("links_not_allowed")) return "가입하고 7일 동안은 링크를 쓸 수 없어요.";
  if (message?.includes("comment_rate_limited")) return "댓글을 너무 많이 달았어요. 잠시 뒤 다시 시도해 주세요.";
  if (message?.includes("member_suspended")) return "이용이 제한된 기간이라 댓글을 달 수 없어요.";
  if (message?.includes("site_read_only")) return "지금은 보기만 할 수 있어요. 잠시 뒤 다시 시도해 주세요.";
  if (message?.includes("row-level security")) return "댓글을 달 수 없는 글이에요.";
  return "댓글을 저장하지 못했어요.";
}

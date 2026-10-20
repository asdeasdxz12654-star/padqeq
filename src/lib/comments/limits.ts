// 댓글 길이 · 신고 사유 (zod 없이: 화면에서 쓴다)

export const COMMENT_MAX = 1000;
/** 댓글 신고 사유 (게시물 신고 사유 중 댓글에 맞는 것) */
export const COMMENT_REPORT_REASONS = ["spam", "sexual", "minor_safety", "portrait_rights", "other"] as const;

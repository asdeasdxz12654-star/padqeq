import { z } from "zod";

// 한도 값 (A-05 ③). 범위 · 적용은 DB(site_limits · set_site_limit)가 다시 확인한다.

export const LIMIT_INFO: Record<string, { label: string; unit: string; help: string }> = {
  report_daily: { label: "하루 신고", unit: "건", help: "회원 한 명이 하루에 할 수 있는 신고 (게시물 · 댓글 합산)" },
  auto_hold_reporters: {
    label: "자동 임시 비공개",
    unit: "명",
    help: "서로 다른 회원이 이만큼 신고하면 자동으로 숨겨요. 기각이 많은 신고자는 세지 않아요.",
  },
  comment_hourly: { label: "한 시간 댓글", unit: "개", help: "회원 한 명이 한 시간에 쓸 수 있는 댓글" },
  new_account_link_days: { label: "신규 계정 링크 금지", unit: "일", help: "가입 후 이 기간 동안 댓글 · 게시판 · 메시지에 링크를 못 넣어요" },
  monthly_upload_photos: { label: "회원별 한 달 업로드", unit: "장", help: "한국 시간 매달 1일에 다시 세요. 운영자는 제한 없어요." },
};

export const LIMIT_ORDER = Object.keys(LIMIT_INFO);

export const limitSchema = z.object({
  key: z.string().refine((k) => k in LIMIT_INFO, "없는 항목이에요."),
  value: z.number().int(),
  note: z.string().trim().min(1, "바꾸는 이유를 적어 주세요.").max(500),
});

const DB_ERRORS: Record<string, string> = {
  limit_out_of_range: "허용 범위를 벗어났어요.",
  no_change: "지금 값과 같아요.",
  limit_not_found: "없는 항목이에요.",
};

export function limitErrorMessage(message: string | undefined): string {
  const key = Object.keys(DB_ERRORS).find((k) => message?.includes(k));
  return key ? DB_ERRORS[key]! : "바꾸지 못했어요.";
}

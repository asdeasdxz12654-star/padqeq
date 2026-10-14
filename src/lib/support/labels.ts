import type { Database } from "@/lib/supabase/database.types";

export type NoticeCategory = Database["public"]["Enums"]["notice_category"];
export type InquiryCategory = Database["public"]["Enums"]["inquiry_category"];

export const NOTICE_CATEGORY_LABEL: Record<NoticeCategory, string> = {
  maintenance: "점검",
  policy: "약관",
  news: "소식",
};

export const INQUIRY_CATEGORY_LABEL: Record<InquiryCategory, string> = {
  account: "계정",
  upload: "업로드",
  credit: "크레딧",
  report: "신고 결과",
  other: "기타",
};

/** 답변 목표 (화면에 안내) */
export const INQUIRY_ANSWER_DAYS = 3;

export type SiteSwitches = { readOnly: boolean; signupClosed: boolean; uploadsClosed: boolean; message: string };

/** 모든 화면 위 안내 문구. 켜진 스위치가 없으면 null */
export function switchBannerText(s: SiteSwitches): string | null {
  if (s.message) return s.readOnly || s.signupClosed || s.uploadsClosed ? s.message : null;
  if (s.readOnly) return "지금은 사진 보기만 가능해요. 올리기 · 고치기는 잠시 후 다시 열립니다.";
  if (s.uploadsClosed && s.signupClosed) return "지금은 새 가입과 사진 올리기를 잠시 멈췄어요.";
  if (s.uploadsClosed) return "지금은 사진 올리기를 잠시 멈췄어요.";
  if (s.signupClosed) return "지금은 새 가입을 잠시 멈췄어요.";
  return null;
}

import type { CastingForm } from "./schema";
import { Constants, type Database } from "@/lib/supabase/database.types";

export type BoardKind = Database["public"]["Enums"]["board_kind"];
export type CastingKind = Database["public"]["Enums"]["casting_kind"];
export type CastingTerms = Database["public"]["Enums"]["casting_terms"];

export const BOARDS = Constants.public.Enums.board_kind;

export const BOARD_LABEL: Record<BoardKind, { title: string; help: string }> = {
  casting: { title: "구인 · 섭외", help: "모델 · 촬영 · 합동 코스를 구해요. 지원은 메시지로, 돈은 플랫폼 밖에서 당사자끼리." },
  places: { title: "촬영 장소", help: "촬영하기 좋은 곳 · 허가 · 주의할 점을 나눠요." },
  free: { title: "자유", help: "사진 · 코스프레 이야기를 자유롭게." },
  qna: { title: "Q&A", help: "보정 · 장비 · 촬영 질문과 답." },
};

export const CASTING_KIND_LABEL: Record<CastingKind, string> = {
  model_wanted: "모델 구함",
  photographer_wanted: "촬영 구함",
  group: "동행 · 합동",
};

export const TERMS_LABEL: Record<CastingTerms, string> = {
  paid: "유급 · 협의",
  tfp: "TFP(결과물 제공)",
  any: "조건 무관",
};

export const isBoard = (value: unknown): value is BoardKind => typeof value === "string" && (BOARDS as readonly string[]).includes(value);

/** 지금 여는 게시판. 구인 · 섭외는 2026-10-20부터 쉰다 (이미 쓴 글은 운영진만 보고, DB · 기록은 그대로 둔다) */
export const OPEN_BOARDS = BOARDS.filter((b): b is Exclude<BoardKind, "casting"> => b !== "casting");
export type OpenBoard = (typeof OPEN_BOARDS)[number];
export const isOpenBoard = (value: unknown): value is OpenBoard => typeof value === "string" && (OPEN_BOARDS as readonly string[]).includes(value);

/** 글쓰기 화면 제목 */
export const WRITE_TITLE: Record<OpenBoard, string> = { places: "촬영 장소 글쓰기", free: "자유 글쓰기", qna: "질문하기" };

/** 첫 촬영 안전 가이드 (S-13 ⑨ · S-16 ⑤) */
export const SAFETY_GUIDE = [
  "처음 만날 때는 사람이 많은 공개 장소에서 만나요.",
  "촬영 범위 · 노출 수위 · 결과물 사용 범위 · 크레딧 표기를 메시지로 미리 합의해 두세요. 분쟁 때 근거가 돼요.",
  "선입금 · 계좌 이체를 먼저 요구하면 신고해 주세요. 해담은 결제 · 정산을 하지 않아요.",
  "불편한 요구를 받으면 바로 대화를 멈추고 신고 · 차단하세요.",
];

export type { CastingForm } from "./schema";

export const CASTING_FORM_FIELDS: { key: keyof CastingForm; label: string; placeholder: string; required: boolean }[] = [
  { key: "date", label: "날짜", placeholder: "예: 11.21 오후", required: true },
  { key: "place", label: "장소", placeholder: "예: 서울 · 야외(공원)", required: true },
  { key: "concept", label: "콘셉트", placeholder: "예: 벚꽃 · 라이덴 쇼군", required: false },
  { key: "terms", label: "조건", placeholder: "예: TFP (결과물 제공)", required: true },
  { key: "usage", label: "결과물 사용 범위", placeholder: "예: 해담 · 개인 SNS, 상업 이용 없음", required: true },
  { key: "credit", label: "크레딧 표기", placeholder: "예: 코스어 · 촬영 상호 표기", required: false },
];

export function boardErrorMessage(message: string | undefined): string {
  if (message?.includes("banned_word")) return "쓸 수 없는 말이 들어 있어요.";
  if (message?.includes("links_not_allowed")) return "가입하고 7일 동안은 링크를 쓸 수 없어요.";
  if (message?.includes("adult_required")) return "만 19세 이상 확인을 한 회원만 쓸 수 있어요.";
  if (message?.includes("account_too_new")) return "가입하고 7일이 지나야 섭외 글을 쓸 수 있어요.";
  if (message?.includes("board_rate_limited")) return "오늘은 글을 더 쓸 수 없어요. 내일 다시 시도해 주세요.";
  if (message?.includes("reply_rate_limited")) return "답글을 너무 많이 달았어요. 잠시 뒤 다시 시도해 주세요.";
  if (message?.includes("member_suspended")) return "이용이 제한된 기간이에요.";
  if (message?.includes("site_read_only")) return "지금은 보기만 할 수 있어요.";
  if (message?.includes("row-level security")) return "답글을 달 수 없는 글이에요.";
  return "저장하지 못했어요.";
}

export function messageErrorMessage(message: string | undefined): string {
  if (message?.includes("banned_word")) return "쓸 수 없는 말이 들어 있어요.";
  if (message?.includes("messages_closed")) return "상대가 메시지를 받지 않도록 설정했어요.";
  if (message?.includes("blocked")) return "메시지를 보낼 수 없는 상대예요.";
  if (message?.includes("thread_closed")) return "더 이상 메시지를 보낼 수 없는 대화예요.";
  if (message?.includes("links_not_allowed")) return "가입하고 7일 동안은 링크를 보낼 수 없어요.";
  if (message?.includes("message_rate_limited") || message?.includes("thread_rate_limited")) return "메시지를 너무 많이 보냈어요. 잠시 뒤 다시 시도해 주세요.";
  if (message?.includes("adult_required")) return "섭외 문의는 만 19세 이상끼리만 주고받을 수 있어요.";
  if (message?.includes("casting_closed")) return "마감했거나 볼 수 없는 섭외 글이에요.";
  if (message?.includes("casting_form_invalid")) return "섭외 문의서를 확인해 주세요.";
  if (message?.includes("recipient_invalid")) return "보낼 수 없는 상대예요.";
  if (message?.includes("member_suspended")) return "이용이 제한된 기간이에요.";
  if (message?.includes("site_read_only")) return "지금은 보기만 할 수 있어요.";
  return "보내지 못했어요.";
}

// 사진 분류 (zod 없이: 피드 · 화면 표시에서 쓰므로 브라우저 코드를 가볍게)

export const CATEGORIES = ["cosplay", "model", "landscape", "travel", "other"] as const;
export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  cosplay: "코스프레",
  model: "모델 · 인물",
  landscape: "풍경",
  travel: "여행",
  other: "기타",
};

// 크레딧 역할 (zod 없이: 화면 표시에서 쓴다)

export const CREDIT_ROLES = ["cosplayer", "model", "photographer", "retoucher", "other"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export const CREDIT_ROLE_LABEL: Record<CreditRole, string> = {
  cosplayer: "코스어",
  model: "모델",
  photographer: "촬영",
  retoucher: "보정",
  other: "기타",
};

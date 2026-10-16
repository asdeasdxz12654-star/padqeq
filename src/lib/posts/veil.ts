import { z } from "zod";

// 가림 표시 (S-08 ⑩ · S-14 ①). 규칙은 DB(content_veil 마이그레이션)와 같다.
// '노출 주의'(성인 콘텐츠)와 다르다: 전체 이용가 사진 중 보기 불편할 수 있는 사진을 흐리게 가리고, 눌러야 보인다.

export const VEIL_REASONS = ["gore", "fear", "phobia"] as const;
export type VeilReason = (typeof VEIL_REASONS)[number];

export const VEIL_LABEL: Record<VeilReason, { title: string; help: string }> = {
  gore: { title: "피 · 상처 표현", help: "피 분장, 상처 · 부상 특수 분장" },
  fear: { title: "공포 표현", help: "좀비 · 귀신 같은 공포 분장, 무서운 연출" },
  phobia: { title: "혐오 소재", help: "벌레 · 파충류, 많은 구멍처럼 싫어하는 사람이 많은 소재" },
};

/** 업로드 · 편집 입력: 고르지 않으면 null */
export const veilInput = z.enum(VEIL_REASONS).nullable().default(null);

/** 보는 사람에게 가릴지: 회원이 '바로 보기'를 켰으면 가리지 않는다 */
export function veilFor(reason: VeilReason | null, showVeiled: boolean): VeilReason | null {
  return showVeiled ? null : reason;
}

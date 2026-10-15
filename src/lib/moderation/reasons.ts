// 신고 사유 · 처리 우선순위 (S-15 ⑥ · A-04 ②)
//  · 최우선(목표 24시간): 미성년자 · 초상권 · 도촬 · 딥페이크
//  · 일반(목표 72시간): 성적 콘텐츠 · 저작권 · 스팸 · 기타

export const REPORT_REASONS = [
  "portrait_rights",
  "voyeurism",
  "minor_safety",
  "deepfake",
  "sexual",
  "copyright",
  "spam",
  "other",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REASON_LABEL: Record<ReportReason, { title: string; hint?: string }> = {
  portrait_rights: { title: "내 사진이 동의 없이 올라옴", hint: "초상권 · 본인 확인 후 우선 처리" },
  voyeurism: { title: "몰래 찍은 사진(도촬)" },
  minor_safety: { title: "미성년자 관련 부적절한 콘텐츠", hint: "신고 즉시 임시 비공개" },
  deepfake: { title: "합성 · 딥페이크" },
  sexual: { title: "성적인 콘텐츠" },
  copyright: { title: "내 작품을 무단으로 다시 올림" },
  spam: { title: "스팸 · 사기 · 괴롭힘" },
  other: { title: "기타" },
};

const URGENT = new Set<ReportReason>(["minor_safety", "portrait_rights", "voyeurism", "deepfake"]);

export function isUrgent(reason: ReportReason): boolean {
  return URGENT.has(reason);
}

export type QueueStatus = { urgent: boolean; targetHours: number; elapsedHours: number; overdue: boolean };

/** 같은 게시물에 쌓인 신고들의 처리 목표: 가장 급한 사유 · 가장 오래된 접수 기준 */
export function queueStatus(reports: { reason: ReportReason; created_at: string }[], now: Date = new Date()): QueueStatus {
  const urgent = reports.some((r) => isUrgent(r.reason));
  const oldest = Math.min(...reports.map((r) => Date.parse(r.created_at)));
  const elapsedHours = Math.max(0, (now.getTime() - oldest) / 3_600_000);
  const targetHours = urgent ? 24 : 72;
  return { urgent, targetHours, elapsedHours, overdue: elapsedHours > targetHours };
}

export const MODERATION_DECISIONS = {
  dismiss: { label: "신고 기각", help: "문제가 없어요. 신고를 닫고, 자동 임시 비공개였다면 다시 공개해요." },
  hold: { label: "임시조치", help: "권리 침해 주장이 있어 숨기고 업로더의 소명을 기다려요. (최대 30일)" },
  hide: { label: "게시 중단", help: "게시물을 숨겨요. 업로더 화면에도 '게시를 중단한 글'로 보여요." },
  release: { label: "임시조치 해제", help: "숨김을 풀고 다시 공개해요. 신고 상태는 그대로 둬요." },
  restore: { label: "게시 중단 해제", help: "운영자가 중단한 게시물을 다시 공개해요." },
  quarantine: {
    label: "불법 촬영물 격리",
    help: "도촬 · 딥페이크 · 미성년자 등 불법이 의심될 때. 아무도 못 보고 같은 사진을 다시 못 올려요. 원본은 수사 협조를 위해 보존돼요.",
  },
} as const;
export type ModerationDecision = keyof typeof MODERATION_DECISIONS;

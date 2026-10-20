// 처리함 (관리자 디자인 v2): 신고 · 소명 · 문의 · 요청을 급한 순서 한 목록으로.
// 순서: 긴급(미성년자 · 초상권 · 도촬 · 딥페이크 신고) → 주의(24시간 넘음) → 보통, 같은 단계 안에서는 오래된 것부터.

export type InboxKind = "report" | "appeal" | "comment" | "board" | "message" | "inquiry" | "claim" | "event";
export type InboxLevel = "긴급" | "주의" | "보통";

export const INBOX_KIND_LABEL: Record<InboxKind, string> = {
  report: "게시물 신고",
  appeal: "소명",
  comment: "댓글 신고",
  board: "게시판 신고",
  message: "메시지 신고",
  inquiry: "1:1 문의",
  claim: "크레딧 연결",
  event: "행사 제안",
};

export type InboxItem = {
  key: string;
  kind: InboxKind;
  title: string;
  sub: string;
  at: string;
  href: string;
  urgent: boolean;
};

export type RankedItem = InboxItem & { level: InboxLevel; hours: number };

const RANK: Record<InboxLevel, number> = { 긴급: 0, 주의: 1, 보통: 2 };

export function rankInbox(items: InboxItem[], now: Date = new Date()): RankedItem[] {
  return items
    .map((item) => {
      const hours = Math.max(0, (now.getTime() - Date.parse(item.at)) / 3_600_000);
      const level: InboxLevel = item.urgent ? "긴급" : hours >= 24 ? "주의" : "보통";
      return { ...item, level, hours };
    })
    .sort((a, b) => RANK[a.level] - RANK[b.level] || b.hours - a.hours);
}

/** "12분" · "5시간" · "3일" */
export function ageLabel(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}분`;
  if (hours < 24) return `${Math.round(hours)}시간`;
  return `${Math.round(hours / 24)}일`;
}

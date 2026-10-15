import type { Json } from "@/lib/supabase/database.types";

// 감사 로그 화면 (A-05): 행동 이름 · 요약 · 대상 링크

const ACTION_LABEL: Record<string, string> = {
  moderation: "신고 · 게시물 조치",
  auto_hold: "자동 임시 비공개",
  auto_hide: "댓글 자동 가림",
  post_status: "게시 상태 변경",
  post_trash: "휴지통으로",
  post_untrash: "휴지통에서 복구",
  post_purge: "영구 삭제",
  post_quarantine: "불법 촬영물 격리",
  post_unquarantine: "격리 해제",
  site_limit: "한도 값 변경",
  stale_drafts_purged: "오래된 초안 정리",
  sanction: "회원 제재",
  pii_view: "개인정보 원문 열람",
  credit_claim: "크레딧 연결 처리",
  credit_claim_auto: "크레딧 자동 연결",
  event_rejected: "행사 제안 반려",
  invite_created: "초대 코드 만들기",
  invite_redeemed: "초대 코드 사용",
  site_switches: "긴급 스위치",
  upload_stage: "운영 단계 전환",
  reported_thread_viewed: "신고된 대화 열람",
  account_deletion_requested: "탈퇴 요청",
  account_deletion_cancelled: "탈퇴 취소",
  account_purged: "탈퇴 처리",
  account_purge_failed: "탈퇴 처리 실패",
};

const SANCTION: Record<string, string> = {
  warn: "경고",
  suspend: "이용 정지",
  lift: "정지 해제",
  revoke_upload: "업로드 권한 회수",
  grant_upload: "업로드 권한 주기",
};

const DECISION: Record<string, string> = {
  dismiss: "기각",
  hold: "임시조치",
  hide: "게시 중단",
  release: "임시조치 해제",
  restore: "게시 중단 해제",
};

const obj = (detail: Json): Record<string, Json | undefined> =>
  detail && typeof detail === "object" && !Array.isArray(detail) ? detail : {};

export function auditActionLabel(action: string, detail: Json): string {
  const d = obj(detail);
  const base = ACTION_LABEL[action] ?? action;
  if (action === "sanction" && typeof d.action === "string") return `${base} · ${SANCTION[d.action] ?? d.action}`;
  if (action === "moderation" && typeof d.decision === "string") return `${base} · ${DECISION[d.decision] ?? d.decision}`;
  return base;
}

/** 사람이 읽을 요약: 제목 · 사유 · 메모 · 기간 (나머지 키는 그대로) */
export function auditSummary(detail: Json): string {
  const d = obj(detail);
  const parts: string[] = [];
  if (typeof d.title === "string") parts.push(`「${d.title}」`);
  if (typeof d.reason === "string") parts.push(`사유: ${d.reason}`);
  if (typeof d.note === "string") parts.push(`메모: ${d.note.startsWith("auto:") ? "자동 정리" : d.note}`);
  if (typeof d.days === "number") parts.push(`${d.days}일`);
  const rest = Object.entries(d).filter(
    ([k, v]) => !["title", "reason", "note", "days", "action", "decision", "until", "author_id"].includes(k) && v !== null && v !== undefined,
  );
  for (const [k, v] of rest) parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.join(" · ");
}

export function auditTargetHref(table: string, id: string | null): string | null {
  if (!id) return null;
  if (table === "posts") return `/admin/posts?q=${id}`;
  if (table === "profiles") return `/admin/members/${id}`;
  if (table === "events") return `/events/${id}`;
  return null;
}

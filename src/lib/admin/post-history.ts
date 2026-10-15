import type { Json } from "@/lib/supabase/database.types";
import { CREDIT_ROLE_LABEL, type CreditRole } from "@/lib/photos/credit-input";
import { REASON_LABEL, type ReportReason } from "@/lib/moderation/reasons";
import { auditActionLabel, auditSummary } from "./audit";

// 게시물 처리 이력 (A-03 ⑧): 업로드 · 게시 · 수정 · 사진 추가 · 크레딧 · 신고 · 운영 조치 · 소명 · 오늘의 픽을 시간순으로.

export type HistoryTone = "normal" | "warn" | "danger" | "good";
export type HistoryEvent = { at: string; title: string; detail?: string; who?: string; tone: HistoryTone };

export type PostHistoryInput = {
  post: {
    created_at: string;
    published_at: string | null;
    updated_at: string;
    scheduled_at: string | null;
    trashed_at: string | null;
    quarantined_at: string | null;
  };
  photos: { created_at: string }[];
  credits: { created_at: string; role: CreditRole; status: string; handle: string | null; label: string | null }[];
  reports: { created_at: string; resolved_at: string | null; reason: ReportReason; status: string; reporter: string | null }[];
  appeals: { created_at: string; resolved_at: string | null; status: string }[];
  picks: { pick_date: string }[];
  audit: { created_at: string; action: string; detail: Json; actor_handle: string | null }[];
};

const MINUTE = 60_000;
const STATUS_TONE: Record<string, HistoryTone> = { actioned: "danger", dismissed: "good", accepted: "good", rejected: "warn" };
const REPORT_RESULT: Record<string, string> = { actioned: "조치됨", dismissed: "기각" };
const APPEAL_RESULT: Record<string, string> = { accepted: "받아들임 (다시 공개)", rejected: "조치 유지" };
const CREDIT_STATUS: Record<string, string> = { pending: "승인 대기", approved: "승인", rejected: "거절", external: "미가입자 표기" };

/** 새것이 위로 */
export function buildPostHistory(input: PostHistoryInput): HistoryEvent[] {
  const { post } = input;
  const events: HistoryEvent[] = [{ at: post.created_at, title: "업로드 (초안)", tone: "normal" }];

  if (post.published_at) {
    const scheduled = post.scheduled_at && Date.parse(post.scheduled_at) > Date.parse(post.created_at) + MINUTE;
    events.push({ at: post.published_at, title: scheduled ? "예약 게시" : "게시", tone: "good" });
  }
  // 수정: 마지막으로 고친 시각만 남는다 (게시 직후 1분 안은 게시로 본다)
  const settled = Math.max(Date.parse(post.created_at), Date.parse(post.published_at ?? post.created_at)) + MINUTE;
  if (Date.parse(post.updated_at) > settled) events.push({ at: post.updated_at, title: "마지막 수정", tone: "normal" });

  // 처음 올린 뒤 1시간 넘어 붙은 사진은 '사진 추가'로 묶는다 (같은 시각끼리)
  const added = Map.groupBy(
    input.photos.filter((p) => Date.parse(p.created_at) > Date.parse(post.created_at) + 60 * MINUTE),
    (p) => p.created_at.slice(0, 16),
  );
  for (const list of added.values()) events.push({ at: list[0]!.created_at, title: `사진 ${list.length}장 추가`, tone: "normal" });

  for (const c of input.credits) {
    events.push({
      at: c.created_at,
      title: `크레딧 · ${CREDIT_ROLE_LABEL[c.role] ?? c.role}`,
      detail: `${c.handle ? `@${c.handle}` : (c.label ?? "?")} · ${CREDIT_STATUS[c.status] ?? c.status}`,
      tone: "normal",
    });
  }
  for (const r of input.reports) {
    events.push({ at: r.created_at, title: `신고 · ${REASON_LABEL[r.reason]?.title ?? r.reason}`, who: r.reporter ?? undefined, tone: "warn" });
    if (r.resolved_at) events.push({ at: r.resolved_at, title: `신고 처리 · ${REPORT_RESULT[r.status] ?? r.status}`, tone: STATUS_TONE[r.status] ?? "normal" });
  }
  for (const a of input.appeals) {
    events.push({ at: a.created_at, title: "소명 접수", tone: "warn" });
    if (a.resolved_at) events.push({ at: a.resolved_at, title: `소명 결과 · ${APPEAL_RESULT[a.status] ?? a.status}`, tone: STATUS_TONE[a.status] ?? "normal" });
  }
  // 오늘의 픽은 날짜만 있으므로 그날 0시(한국)로
  for (const p of input.picks) events.push({ at: `${p.pick_date}T00:00:00+09:00`, title: "오늘의 픽", tone: "good" });

  for (const a of input.audit) {
    const label = auditActionLabel(a.action, a.detail);
    const tone: HistoryTone = /purge|quarantine|trash|hide/.test(a.action) || label.includes("게시 중단") ? "danger" : "normal";
    events.push({ at: a.created_at, title: label, detail: auditSummary(a.detail) || undefined, who: a.actor_handle ?? "자동", tone });
  }

  return events.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

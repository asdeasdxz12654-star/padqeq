// 운영 대시보드 (A-01): DB 함수 admin_dashboard()의 숫자를 화면용으로 정리한다.

export type Dashboard = {
  signups_today: number;
  photos_today: number;
  published_today: number;
  members: number;
  uploaders: number;
  published: number;
  scheduled: number;
  trash: number;
  photo_bytes: number;
  suspended: number;
  urgent_reports: number;
  oldest_urgent_at: string | null;
  tomorrow_pick_empty: boolean;
  trash_due_week: number;
};

export type Todo = { level: "긴급" | "주의" | "안내"; text: string; href: string };

/** R2 무료 저장 용량 (A-01 ⑤) */
export const R2_FREE_BYTES = 10 * 1024 ** 3;

/** 무료 한도 사용률 단계: 70% 노랑, 90% 빨강 */
export const usageLevel = (ratio: number): "ok" | "warn" | "danger" => (ratio >= 0.9 ? "danger" : ratio >= 0.7 ? "warn" : "ok");

export function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

/** 할 일 (A-01 ⑩): 긴급 · 주의 · 안내 순서. 처리하면 저절로 사라진다. */
export function buildTodos(
  d: Dashboard,
  now: number = Date.now(),
  ops: { backup?: BackupState; stuckDrafts?: number } = {},
): Todo[] {
  const todos: Todo[] = [];
  if (ops.backup === "missing" || ops.backup === "stale") {
    todos.push({ level: "긴급", text: "최근 26시간 안의 DB 백업이 없어요. GitHub Actions › DB 백업 실행 기록을 확인해 주세요.", href: "/admin" });
  }
  if (d.urgent_reports > 0) {
    const hours = d.oldest_urgent_at ? Math.floor((now - Date.parse(d.oldest_urgent_at)) / 3_600_000) : 0;
    todos.push({
      level: "긴급",
      text: `최우선 신고(미성년자 · 초상권 · 도촬 · 딥페이크) ${d.urgent_reports}건 — 가장 오래된 것 접수 후 ${hours}시간`,
      href: "/admin/reports",
    });
  }
  const ratio = d.photo_bytes / R2_FREE_BYTES;
  if (usageLevel(ratio) !== "ok") {
    todos.push({
      level: usageLevel(ratio) === "danger" ? "긴급" : "주의",
      text: `사진 저장 용량이 무료 한도의 ${Math.round(ratio * 100)}%예요`,
      href: "/admin/posts?view=trash",
    });
  }
  if (d.tomorrow_pick_empty && d.published > 0) {
    todos.push({ level: "주의", text: "내일 오늘의 픽 편성이 비어 있어요 (게시물 화면에서 고를 수 있어요)", href: "/admin/posts" });
  }
  if (ops.stuckDrafts) {
    todos.push({ level: "안내", text: `올리다 멈춘 초안 ${ops.stuckDrafts}개 (7일이 지나면 자동으로 지워져요)`, href: "/admin/posts?status=draft" });
  }
  if (d.trash_due_week > 0) {
    todos.push({ level: "안내", text: `휴지통에서 7일 안에 영구 삭제될 게시물 ${d.trash_due_week}개`, href: "/admin/posts?view=trash" });
  }
  return todos;
}

/** 백업 (A-01 ⑨): 매일 02:00 KST에 올라온다. 26시간 넘게 새 백업이 없으면 문제. */
export const BACKUP_MAX_AGE_MS = 26 * 3_600_000;
export type BackupState = "ok" | "stale" | "missing" | "unknown";
export function backupState(latest: string | null | undefined, now: number = Date.now()): BackupState {
  if (latest === undefined) return "unknown";
  if (latest === null) return "missing";
  return now - Date.parse(latest) > BACKUP_MAX_AGE_MS ? "stale" : "ok";
}

/** 이번 달 예상 비용 (A-01 ⑥, 미국 달러). Workers 유료 $5 고정 + R2 무료 10GB 넘는 저장 용량 $0.015/GB. 요청 횟수 비용 · 환율은 빼고 본다. */
export const WORKERS_MONTHLY_USD = 5;
export const R2_USD_PER_GB = 0.015;
export function estimateMonthlyUsd(storedBytes: number): { workers: number; storage: number; total: number } {
  const overGb = Math.max(0, (storedBytes - R2_FREE_BYTES) / 1024 ** 3);
  const storage = Math.round(overGb * R2_USD_PER_GB * 100) / 100;
  return { workers: WORKERS_MONTHLY_USD, storage, total: WORKERS_MONTHLY_USD + storage };
}

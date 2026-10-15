import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import type { Metadata } from "next";
import Link from "next/link";
import { countStuckDrafts, getBackupInfo } from "@/lib/admin/ops-status";
import { type Dashboard, R2_FREE_BYTES, backupState, buildTodos, estimateMonthlyUsd, formatBytes, usageLevel } from "@/lib/admin/dashboard";
import { getAdminPending } from "@/lib/admin/pending";
import { createClient } from "@/lib/supabase/server";
import { getSiteSwitches } from "@/lib/support/switches";

export const metadata: Metadata = { title: "운영" };

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const BACKUP_LABEL = { ok: "정상", stale: "늦음", missing: "없음", unknown: "확인 못 함" } as const;

// 운영 첫 화면 (A-01): 오늘 지표 · 운영 상태(백업 · 멈춘 업로드 · 예상 비용) · 저장 용량 · 할 일 · 처리 대기 · 각 운영 화면으로
export default async function AdminHomePage() {
  // 운영 도우미의 첫 화면은 신고 처리
  if ((await getViewer())?.profile?.role !== "admin") redirect("/admin/reports");
  const supabase = await createClient();
  const [pending, switches, backup, stuckDrafts, dash] = await Promise.all([
    getAdminPending(),
    getSiteSwitches(),
    getBackupInfo(),
    countStuckDrafts(),
    supabase.rpc("admin_dashboard").then((r) => {
      if (r.error) throw r.error;
      return r.data as unknown as Dashboard;
    }),
  ]);
  const backupNow = backupState(backup === null ? undefined : (backup.latest?.at ?? null));
  const todos = buildTodos(dash, undefined, { backup: backupNow, stuckDrafts });
  const cost = estimateMonthlyUsd(dash.photo_bytes + (backup?.totalBytes ?? 0));
  const storageRatio = dash.photo_bytes / R2_FREE_BYTES;
  const storageLevel = usageLevel(storageRatio);
  const kpis: { label: string; value: number; href?: string; alert?: boolean }[] = [
    { label: "오늘 가입", value: dash.signups_today, href: "/admin/members" },
    { label: "오늘 올린 사진", value: dash.photos_today, href: "/admin/posts" },
    { label: "오늘 게시", value: dash.published_today, href: "/admin/posts?status=published" },
    { label: "최우선 신고", value: dash.urgent_reports, href: "/admin/reports", alert: dash.urgent_reports > 0 },
  ];
  const totals: [string, number, string][] = [
    ["회원", dash.members, "/admin/members"],
    ["업로드 회원", dash.uploaders, "/admin/members?f=uploaders"],
    ["게시물", dash.published, "/admin/posts?status=published"],
    ["예약", dash.scheduled, "/admin/posts?status=scheduled"],
    ["휴지통", dash.trash, "/admin/posts?view=trash"],
    ["정지 중", dash.suspended, "/admin/members?f=suspended"],
  ];
  const switchOn = switches.readOnly || switches.signupClosed || switches.uploadsClosed;

  const cards: { href: string; title: string; help: string; count: number }[] = [
    { href: "/admin/reports", title: "게시물 신고", help: "급한 사유 · 오래된 순", count: pending.reports },
    { href: "/admin/reports?tab=appeals", title: "소명", help: "조치된 글의 이의 제기", count: pending.appeals },
    { href: "/admin/reports?tab=comments", title: "댓글 신고", help: "가리기 · 기각", count: pending.comments },
    { href: "/admin/reports?tab=board", title: "게시판 신고", help: "글 · 답글", count: pending.board },
    { href: "/admin/reports?tab=messages", title: "메시지 신고", help: "열람 기록이 남아요", count: pending.messages },
    { href: "/admin/support", title: "1:1 문의", help: "답하면 회원에게 알림", count: pending.inquiries },
    { href: "/admin/events", title: "행사 제안", help: "승인하면 행사 태그가 생겨요", count: pending.events },
    { href: "/admin/reports?tab=claims", title: "크레딧 연결", help: "본인인지 확인하고 연결", count: pending.claims },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">운영</h1>
        <span className="text-sm text-quiet">{pending.total ? `처리할 일 ${pending.total}건` : "처리할 일이 없어요"}</span>
      </header>

      {switchOn && (
        <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          긴급 스위치가 켜져 있어요 ({[switches.readOnly && "읽기 전용", switches.signupClosed && "가입 중단", switches.uploadsClosed && "업로드 중단"].filter(Boolean).join(" · ")}).{" "}
          <Link href="/admin/support?tab=system" className="underline underline-offset-2">
            스위치 보기
          </Link>
        </p>
      )}

      <section aria-labelledby="today-heading">
        <h2 id="today-heading" className="sr-only">
          오늘
        </h2>
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <li key={k.label}>
              <Link
                href={k.href ?? "/admin"}
                className={`flex h-full flex-col gap-1 rounded-xl border p-4 hover:border-quiet ${k.alert ? "border-red-400/70" : "border-line"}`}
              >
                <span className="text-xs text-quiet">{k.label}</span>
                <span className={`text-2xl font-bold tabular-nums ${k.alert ? "text-red-300" : ""}`}>{k.value.toLocaleString("ko-KR")}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {todos.length > 0 && (
        <section aria-labelledby="tasks-heading">
          <h2 id="tasks-heading" className="mb-3 text-lg font-semibold">
            할 일
          </h2>
          <ul className="flex flex-col gap-2">
            {todos.map((t) => (
              <li key={t.text}>
                <Link href={t.href} className="flex items-center gap-3 rounded-xl border border-line px-4 py-3 text-sm hover:border-quiet">
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      t.level === "긴급" ? "bg-red-500/20 text-red-300" : t.level === "주의" ? "bg-amber-400/20 text-amber-200" : "border border-line text-quiet"
                    }`}
                  >
                    {t.level}
                  </span>
                  <span className="min-w-0 flex-1">{t.text}</span>
                  <span aria-hidden className="text-quiet">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="totals-heading" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div>
          <h2 id="totals-heading" className="mb-3 text-lg font-semibold">
            전체
          </h2>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {totals.map(([label, value, href]) => (
              <li key={label}>
                <Link href={href} className="flex flex-col rounded-xl border border-line px-3 py-2.5 hover:border-quiet">
                  <span className="text-xs text-quiet">{label}</span>
                  <span className="font-semibold tabular-nums">{value.toLocaleString("ko-KR")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-3 text-lg font-semibold">저장 용량</h2>
          <div className="flex flex-col gap-2 rounded-xl border border-line p-4 text-sm">
            <p className="flex justify-between">
              <span>사진 (R2 무료 10GB)</span>
              <span className="tabular-nums">
                {formatBytes(dash.photo_bytes)} · {Math.round(storageRatio * 100)}%
              </span>
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-surface" role="presentation">
              <div
                className={`h-full ${storageLevel === "danger" ? "bg-red-400" : storageLevel === "warn" ? "bg-amber-300" : "bg-accent"}`}
                style={{ width: `${Math.min(100, Math.max(1, storageRatio * 100))}%` }}
              />
            </div>
            <p className="text-xs text-quiet">원본(마스터) 기준이에요. 70%부터 노랑, 90%부터 빨강.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="ops-heading">
        <h2 id="ops-heading" className="mb-3 text-lg font-semibold">
          운영 상태
        </h2>
        <ul className="grid gap-2 sm:grid-cols-3">
          <li className={`flex flex-col gap-1 rounded-xl border p-4 ${backupNow === "ok" ? "border-line" : backupNow === "unknown" ? "border-line" : "border-red-400/70"}`}>
            <span className="text-xs text-quiet">DB 백업 (매일 02:00)</span>
            <span className={`text-xl font-bold ${backupNow === "ok" ? "" : backupNow === "unknown" ? "text-quiet" : "text-red-300"}`}>{BACKUP_LABEL[backupNow]}</span>
            <span className="text-xs text-quiet">
              {backup?.latest
                ? `마지막 ${timeFormat.format(new Date(backup.latest.at))} · ${formatBytes(backup.latest.size)} · ${backup.days}일 치 보관`
                : backup
                  ? "아직 백업이 없어요"
                  : "백업 저장소를 읽지 못했어요"}
            </span>
          </li>
          <li className="flex flex-col gap-1 rounded-xl border border-line p-4">
            <span className="text-xs text-quiet">올리다 멈춘 초안 (하루 넘음)</span>
            <span className="text-xl font-bold tabular-nums">{stuckDrafts}</span>
            <span className="text-xs text-quiet">7일이 지나면 자동으로 지워져요</span>
          </li>
          <li className="flex flex-col gap-1 rounded-xl border border-line p-4">
            <span className="text-xs text-quiet">이번 달 예상 비용</span>
            <span className="text-xl font-bold tabular-nums">${cost.total.toFixed(2)}</span>
            <span className="text-xs text-quiet">
              Workers ${cost.workers.toFixed(2)} + 저장 용량 ${cost.storage.toFixed(2)} · 요청 수 비용 · 환율 제외
            </span>
          </li>
        </ul>
      </section>

      <section aria-labelledby="todo-heading">
        <h2 id="todo-heading" className="mb-3 text-lg font-semibold">
          처리 대기
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="flex h-full flex-col gap-1 rounded-xl border border-line p-4 hover:border-quiet">
                <span className="flex items-center justify-between font-semibold">
                  {c.title}
                  <span className={`rounded-full px-2 text-sm ${c.count ? "bg-red-500/20 text-red-300" : "text-quiet"}`}>{c.count}</span>
                </span>
                <span className="text-xs text-quiet">{c.help}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tools-heading">
        <h2 id="tools-heading" className="mb-3 text-lg font-semibold">
          관리
        </h2>
        <nav className="flex flex-wrap gap-2 text-sm">
          {[
            ["/admin/posts", "게시물 관리"],
            ["/admin/posts?view=trash", "휴지통"],
            ["/admin/members", "회원 관리"],
            ["/admin/audit", "감사 로그"],
            ["/admin/events", "행사 관리"],
            ["/admin/support?tab=notices", "공지"],
            ["/admin/support?tab=system", "긴급 스위치"],
            ["/upload", "업로드"],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-xl border border-line px-4 py-2 hover:border-quiet">
              {label}
            </Link>
          ))}
        </nav>
      </section>
    </div>
  );
}

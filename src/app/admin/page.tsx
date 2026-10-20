import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import type { Metadata } from "next";
import Link from "next/link";
import { countStuckDrafts, getBackupInfo } from "@/lib/admin/ops-status";
import { type Dashboard, R2_FREE_BYTES, backupState, buildTodos, estimateMonthlyUsd, formatBytes, usageLevel } from "@/lib/admin/dashboard";
import { loadInbox } from "@/lib/admin/inbox";
import { ageLabel, INBOX_KIND_LABEL } from "@/lib/admin/inbox-rank";
import { getAdminPending } from "@/lib/admin/pending";
import { countTagChores, type TagChores } from "@/lib/admin/tag-chores";
import { createClient } from "@/lib/supabase/server";
import { getSiteSwitches } from "@/lib/support/switches";
import { loadPicksPanel } from "@/lib/admin/picks";
import { ExhibitList, PicksPanel } from "./picks-panel";
import { KST } from "@/lib/format/kst";

export const metadata: Metadata = { title: "운영" };

const timeFormat = KST.monthDayTime;
const BACKUP_LABEL = { ok: "정상", stale: "늦음", missing: "없음", unknown: "확인 못 함" } as const;

// 운영 첫 화면 (관리 시안 44): 매일 볼 것(숫자 4칸 · 처리할 일 · 오늘의 픽 · 화면 오류 · 정리할 일 · 전시 중)을 위에,
// 가끔 볼 것(누적 · 저장 용량 · 운영 상태)은 아래에 접어 둔다. 휴대폰은 처리할 일이 맨 위.
export default async function AdminHomePage() {
  // 운영 도우미의 첫 화면은 신고 처리
  if ((await getViewer())?.profile?.role !== "admin") redirect("/admin/inbox");
  const supabase = await createClient();
  const [pending, inbox, switches, backup, stuckDrafts, dash, chores, errors, picks] = await Promise.all([
    getAdminPending(),
    loadInbox(true),
    getSiteSwitches(),
    getBackupInfo(),
    countStuckDrafts(),
    supabase.rpc("admin_dashboard").then((r) => {
      if (r.error) throw r.error;
      return r.data as unknown as Dashboard;
    }),
    loadTagChores(),
    // 화면 오류 (최근 7일): 회원이 문의하지 않아도 보이게
    supabase.rpc("admin_recent_errors", { days: 7 }).then((r) => r.data ?? []),
    loadPicksPanel(),
  ]);
  const errorHits = errors.reduce((n, e) => n + e.hits, 0);
  const backupNow = backupState(backup === null ? undefined : (backup.latest?.at ?? null));
  const todos = buildTodos(dash, undefined, { backup: backupNow, stuckDrafts });
  const cost = estimateMonthlyUsd(dash.photo_bytes + (backup?.totalBytes ?? 0));
  const storageRatio = dash.photo_bytes / R2_FREE_BYTES;
  const storageLevel = usageLevel(storageRatio);
  const urgent = inbox.filter((i) => i.level === "긴급").length;
  const kpis: { label: string; value: number; help: string; href: string; alert?: boolean }[] = [
    { label: "처리함", value: inbox.length, help: urgent ? `긴급 ${urgent}` : "급한 일 없음", href: "/admin/inbox", alert: urgent > 0 },
    { label: "오늘 게시", value: dash.published_today, help: `사진 ${dash.photos_today.toLocaleString("ko-KR")}장`, href: "/admin/posts?status=published" },
    { label: "오늘 가입", value: dash.signups_today, help: `전체 ${dash.members.toLocaleString("ko-KR")}명`, href: "/admin/members" },
    { label: "화면 오류 (7일)", value: errors.length, help: `${errorHits}번 났어요`, href: "#errors-heading", alert: errors.length > 0 },
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

  const choreCards: { href: string; title: string; help: string; count: number }[] = [
    { href: "/admin/tags?view=similar", title: "비슷한 태그 짝", help: "같은 대상이면 합치기", count: chores.similarPairs },
    { href: "/admin/tags?view=nolocation&kind=place", title: "위치 없는 장소", help: "주소로 찾아 지도에 올리기", count: chores.placesWithoutLocation },
    { href: "/admin/events", title: "장소 없는 행사", help: "열리는 곳을 고르면 지도에 나와요", count: chores.eventsWithoutPlace },
    { href: "/admin/tags?view=pending", title: "확인 전 새 태그", help: "회원이 만든 태그 (이미 공개 중) · 확인 · 합치기 · 지우기", count: chores.pendingTags },
  ];

  const levelClass = (level: string) =>
    level === "긴급" ? "bg-accent text-on-accent" : level === "주의" ? "bg-accent-soft text-accent" : "border border-line text-quiet";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">운영</h1>
        <span className="text-sm text-quiet">{pending.total ? `처리할 일 ${pending.total}건` : "처리할 일이 없어요"}</span>
      </header>

      {switchOn && (
        <p className="rounded-xl border border-warn-line bg-warn-soft px-4 py-3 text-sm text-warn">
          긴급 스위치가 켜져 있어요 ({[switches.readOnly && "읽기 전용", switches.signupClosed && "가입 중단", switches.uploadsClosed && "업로드 중단"].filter(Boolean).join(" · ")}).{" "}
          <Link href="/admin/support?tab=system" className="underline underline-offset-2">
            스위치 보기
          </Link>
        </p>
      )}

      <section aria-label="오늘">
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <li key={k.label}>
              <Link href={k.href} className={`flex h-full flex-col gap-0.5 rounded-xl border p-4 hover:border-quiet ${k.alert ? "border-danger-line" : "border-line"}`}>
                <span className="text-xs text-quiet">{k.label}</span>
                <span className={`text-2xl font-bold tabular-nums ${k.alert ? "text-danger" : ""}`}>{k.value.toLocaleString("ko-KR")}</span>
                <span className="text-xs text-quiet">{k.help}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* 오른쪽(휴대폰은 위): 처리할 일 · 할 일 · 정리할 일 · 전시 중 */}
        <div className="flex flex-col gap-6 lg:order-2">
          <section aria-labelledby="now-heading" className="flex flex-col gap-3 rounded-2xl border border-line p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="now-heading" className="text-lg font-semibold">
                처리할 일
              </h2>
              <Link href="/admin/inbox" className="text-sm text-quiet hover:text-text">
                처리함 {inbox.length}건 ›
              </Link>
            </div>
            {inbox.length === 0 ? (
              <p className="py-4 text-center text-sm text-quiet">처리할 일이 없어요.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {inbox.slice(0, 3).map((i) => (
                  <li key={i.key}>
                    <Link href={`/admin/inbox?item=${i.key}`} prefetch={false} className="flex items-center gap-3 py-2.5 hover:bg-surface">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${levelClass(i.level)}`}>{i.level}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-semibold">{i.title}</span>
                        <span className="truncate text-xs text-quiet">{INBOX_KIND_LABEL[i.kind]}</span>
                      </span>
                      <span className="shrink-0 text-xs text-quiet tabular-nums">{ageLabel(i.hours)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {todos.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
                {todos.map((t) => (
                  <li key={t.text}>
                    <Link href={t.href} className="flex items-center gap-2 text-sm hover:underline">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${t.level === "긴급" ? "bg-danger-soft text-danger" : t.level === "주의" ? "bg-warn-soft text-warn" : "border border-line text-quiet"}`}>{t.level}</span>
                      <span className="min-w-0 flex-1">{t.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="chores-heading" className="flex flex-col gap-2 rounded-2xl border border-line p-4">
            <h2 id="chores-heading" className="text-lg font-semibold">
              정리할 일 <span className="text-xs font-normal text-quiet">급하지 않음</span>
            </h2>
            <ul className="flex flex-col divide-y divide-line">
              {choreCards.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{c.title}</span> <span className="text-xs text-quiet">{c.help}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 text-sm tabular-nums ${c.count ? "bg-warn-soft text-warn" : "text-quiet"}`}>{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-quiet">새 태그끼리도 바로 합칠 수 있어요. 남긴 태그는 확인됨이 돼요.</p>
          </section>

          <section aria-labelledby="exhibits-heading" className="flex flex-col gap-2 rounded-2xl border border-line p-4">
            <h2 id="exhibits-heading" className="text-lg font-semibold">
              전시 중 <span className="text-xs font-normal text-quiet">컬렉션 {picks.exhibits.length}</span>
            </h2>
            <ExhibitList exhibits={picks.exhibits} />
          </section>
        </div>

        {/* 왼쪽: 오늘의 픽 · 화면 오류 */}
        <div className="flex min-w-0 flex-col gap-6">
          <PicksPanel data={picks} />

          <section aria-labelledby="errors-heading" className="scroll-mt-24">
            <h2 id="errors-heading" className="mb-1 text-lg font-semibold">
              화면 오류 <span className="text-sm font-normal text-quiet">최근 7일 · {errorHits}번</span>
            </h2>
            <p className="mb-3 text-xs text-quiet">회원 화면에 오류가 났을 때 오류 번호 · 화면 주소만 모아요(누가 겪었는지는 남기지 않아요). 문의에 적힌 오류 번호와 같으면 같은 문제예요.</p>
            {errors.length === 0 ? (
              <p className="rounded-xl border border-line px-4 py-6 text-center text-sm text-quiet">최근 7일 동안 난 오류가 없어요.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-xl border border-line text-sm">
                {errors.slice(0, 20).map((e) => (
                  <li key={`${e.digest}${e.path}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                    <span className="font-mono text-xs">{e.digest}</span>
                    <span className="min-w-0 flex-1 truncate text-quiet">{e.path}</span>
                    <span className={`tabular-nums ${e.hits >= 10 ? "font-semibold text-danger" : "text-quiet"}`}>{e.hits}번</span>
                    <span className="text-xs text-quiet">{timeFormat.format(new Date(e.last_at))}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* 가끔 볼 것: 누적 · 저장 용량 · 운영 상태 (접어 둔다) */}
      <details className="rounded-2xl border border-line px-4 py-3">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
          <span className="font-semibold">누적 · 저장 용량 · 운영 상태</span>
          <span className="text-xs text-quiet">
            사진 {Math.round(storageRatio * 100)}% · 백업 {BACKUP_LABEL[backupNow]} · 이번 달 ${cost.total.toFixed(2)}
          </span>
          <span aria-hidden="true" className="ml-auto text-quiet">
            ▾
          </span>
        </summary>
        <div className="mt-4 mb-2 flex flex-col gap-6">
          <section aria-labelledby="totals-heading" className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 id="totals-heading" className="mb-3 text-base font-semibold">
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
              <h2 className="mb-3 text-base font-semibold">저장 용량</h2>
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
            <h2 id="ops-heading" className="mb-3 text-base font-semibold">
              운영 상태
            </h2>
            <ul className="grid gap-2 sm:grid-cols-3">
              <li className={`flex flex-col gap-1 rounded-xl border p-4 ${backupNow === "ok" || backupNow === "unknown" ? "border-line" : "border-danger-line"}`}>
                <span className="text-xs text-quiet">DB 백업 (매일 02:00)</span>
                <span className={`text-xl font-bold ${backupNow === "ok" ? "" : backupNow === "unknown" ? "text-quiet" : "text-danger"}`}>{BACKUP_LABEL[backupNow]}</span>
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
        </div>
      </details>
    </div>
  );
}

/** 태그 · 지도 정리 할 일 (태그 관리 · 행사 관리 화면과 같은 기준) */
async function loadTagChores(): Promise<TagChores> {
  const supabase = await createClient();
  const [tags, events] = await Promise.all([
    supabase.from("tags").select("id, kind, name, status, lat, lng, tag_aliases(alias)").limit(3000),
    supabase.from("events").select("place_tag_id").eq("status", "official").limit(1000),
  ]);
  if (tags.error) throw tags.error;
  if (events.error) throw events.error;
  return countTagChores(
    tags.data.map((t) => ({ id: t.id, kind: t.kind, name: t.name, status: t.status, lat: t.lat, lng: t.lng, aliases: t.tag_aliases.map((a) => a.alias) })),
    events.data,
  );
}

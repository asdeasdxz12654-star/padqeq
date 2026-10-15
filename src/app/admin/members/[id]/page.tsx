import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { REASON_LABEL, type ReportReason } from "@/lib/moderation/reasons";
import { SANCTION_LABEL, type SanctionAction, availableActions, daysLabel, isActiveRestriction } from "@/lib/moderation/sanctions";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { RevealEmail } from "./reveal-email";
import { SanctionForm } from "./sanction-form";

export const metadata: Metadata = { title: "회원 관리" };

// A-05 회원 상세: 상태 · 게시물 · 받은 신고 · 제재 기록 · 조치

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });
const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

const STATUS_LABEL: Record<string, string> = { draft: "초안", published: "게시", hidden: "게시 중단" };

type ReceivedReport = {
  id: string;
  reason: ReportReason;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  post: { id: string; title: string } | null;
};

export default async function AdminMemberPage({ params }: PageProps<"/admin/members/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();

  const [{ data: member, error }, restriction, posts, reports, history, account, reporterStats] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, handle, display_name, bio, role, can_upload, created_at, deletion_requested_at")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("member_restrictions").select("suspended_until, reason, created_at").eq("member_id", id).maybeSingle(),
    supabase
      .from("posts")
      .select("id, title, status, held_at, created_at")
      .eq("author_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    // 이 회원의 글에 들어온 신고 (운영자는 RLS상 모두 본다)
    supabase
      .from("reports")
      .select("id, reason, status, created_at, post:posts!reports_post_id_fkey!inner(id, title, author_id)")
      .eq("post.author_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.rpc("member_sanction_history", { target: id }),
    // 개인정보는 가려서 (A-05 ④)
    supabase.rpc("admin_member_account", { target: id }).maybeSingle(),
    // 이 회원이 한 신고 (허위 신고 이력)
    supabase.rpc("admin_reporter_stats", { ids: [id] }).maybeSingle(),
  ]);
  const madeReports = reporterStats.data;
  if (error) throw error;
  if (!member) notFound();
  if (restriction.error || posts.error || reports.error || history.error) {
    throw restriction.error ?? posts.error ?? reports.error ?? history.error;
  }

  const suspended = restriction.data && isActiveRestriction(restriction.data.suspended_until) ? restriction.data : null;
  const postRows = posts.data;
  const received = reports.data as unknown as ReceivedReport[];
  const count = (pred: (p: (typeof postRows)[number]) => boolean) => postRows.filter(pred).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <Link href="/admin/members" className="text-sm text-quiet hover:underline">
        ‹ 회원 목록
      </Link>

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{member.display_name}</h1>
          <p className="text-sm text-quiet">
            <Link href={profileHref(member.handle)} className="hover:underline">
              @{member.handle}
            </Link>{" "}
            · {dateFormat.format(new Date(member.created_at))} 가입
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs md:ml-auto">
          {member.role === "admin" && <span className="rounded-full border border-line px-2 py-0.5">운영자</span>}
          <span className="rounded-full border border-line px-2 py-0.5">{member.can_upload ? "업로드 권한 있음" : "업로드 권한 없음"}</span>
          {suspended && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-red-300">정지 중</span>}
          {member.deletion_requested_at && <span className="rounded-full border border-line px-2 py-0.5 text-quiet">탈퇴 유예</span>}
        </div>
      </header>

      {suspended && (
        <p className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-100">
          {timeFormat.format(new Date(suspended.suspended_until))}까지 정지 · 회원에게 보이는 사유: {suspended.reason}
        </p>
      )}

      <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
        <dt className="text-quiet">이메일</dt>
        <dd>
          <RevealEmail memberId={member.id} masked={account.data?.masked_email ?? null} />
        </dd>
        <dt className="text-quiet">로그인</dt>
        <dd>{account.data?.provider ?? "-"}</dd>
        <dt className="text-quiet">한 신고</dt>
        <dd className={madeReports?.unreliable ? "text-amber-300" : undefined}>
          {madeReports
            ? `${madeReports.total}건 · 조치 ${madeReports.actioned} · 기각 ${madeReports.dismissed}${madeReports.unreliable ? " · 신뢰 낮음 (자동 임시 비공개에 세지 않음)" : ""}`
            : "없음"}
        </dd>
        <dt className="text-quiet">최근 로그인</dt>
        <dd>{account.data?.last_sign_in_at ? timeFormat.format(new Date(account.data.last_sign_in_at)) : "-"}</dd>
      </dl>

      <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {[
          ["게시", count((p) => p.status === "published" && !p.held_at)],
          ["임시 비공개", count((p) => p.held_at !== null)],
          ["게시 중단", count((p) => p.status === "hidden")],
          ["받은 신고", received.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line px-3 py-3">
            <dt className="text-xs text-quiet">{label}</dt>
            <dd className="text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>

      {member.role === "admin" ? (
        <p className="text-sm text-quiet">운영자 계정은 제재할 수 없어요.</p>
      ) : (
        <section aria-labelledby="sanction-heading" className="rounded-xl border border-line p-4">
          <h2 id="sanction-heading" className="mb-3 text-lg font-semibold">
            조치
          </h2>
          <SanctionForm memberId={member.id} options={availableActions({ canUpload: member.can_upload, suspended: suspended !== null })} />
        </section>
      )}

      <section aria-labelledby="history-heading">
        <h2 id="history-heading" className="mb-3 text-lg font-semibold">
          제재 기록
        </h2>
        {history.data.length === 0 ? (
          <p className="text-sm text-quiet">기록이 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {history.data.map((h, i) => {
              const detail = h.detail as { note?: string; days?: number; reason?: string };
              return (
                <li key={i} className="rounded-xl border border-line p-3 text-sm">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold">{SANCTION_LABEL[h.action as SanctionAction]?.label ?? h.action}</span>
                    {detail.days ? <span>{daysLabel(detail.days)}</span> : null}
                    <span className="text-xs text-quiet">
                      {timeFormat.format(new Date(h.created_at))} · @{h.actor_handle ?? "?"}
                    </span>
                  </p>
                  {detail.reason && <p className="mt-1">회원에게: {detail.reason}</p>}
                  {detail.note && <p className="mt-1 text-quiet">메모: {detail.note}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="mb-3 text-lg font-semibold">
          받은 신고 <span className="text-sm font-normal text-quiet">최근 50건</span>
        </h2>
        {received.length === 0 ? (
          <p className="text-sm text-quiet">받은 신고가 없어요.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {received.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line p-3 text-sm">
                <span className={r.status === "open" ? "text-amber-300" : r.status === "actioned" ? "text-emerald-400" : "text-quiet"}>
                  {r.status === "open" ? "대기" : r.status === "actioned" ? "조치" : "기각"}
                </span>
                {r.post && (
                  <Link href={r.status === "open" ? `/admin/reports?post=${r.post.id}` : `/p/${r.post.id}`} className="font-medium hover:underline">
                    {r.post.title}
                  </Link>
                )}
                <span className="text-quiet">{REASON_LABEL[r.reason].title}</span>
                <span className="text-xs text-quiet">{timeFormat.format(new Date(r.created_at))}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="posts-heading">
        <h2 id="posts-heading" className="mb-3 text-lg font-semibold">
          게시물 <span className="text-sm font-normal text-quiet">{postRows.length}</span>
        </h2>
        {postRows.length === 0 ? (
          <p className="text-sm text-quiet">게시물이 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {postRows.map((p) => (
              <li key={p.id}>
                <Link href={`/p/${p.id}`} className="flex items-baseline gap-3 px-4 py-2.5 text-sm hover:bg-surface">
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  <span className={`shrink-0 text-xs ${p.held_at || p.status === "hidden" ? "text-amber-300" : "text-quiet"}`}>
                    {p.held_at ? "임시 비공개" : STATUS_LABEL[p.status]}
                  </span>
                  <span className="shrink-0 text-xs text-quiet">{dateFormat.format(new Date(p.created_at))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

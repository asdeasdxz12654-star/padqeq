import type { Metadata } from "next";
import Link from "next/link";
import { REASON_LABEL, queueStatus, type ReportReason } from "@/lib/moderation/reasons";
import { photoSources } from "@/lib/photos/server";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";
import { BlurredPreview } from "./blurred-preview";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "신고 처리" };

// A-04 신고 · 검수 처리 (신고 대기열 · 소명 · 처리 완료)
// 같은 게시물의 신고는 하나로 묶고, 가장 급한 사유 · 가장 오래된 접수 순으로 놓는다.

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" });

type ReportRow = {
  id: string;
  reason: ReportReason;
  detail: string;
  photo_position: number | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  reporter: { handle: string; created_at: string } | null;
  post: {
    id: string;
    title: string;
    status: string;
    held_at: string | null;
    held_reason: string | null;
    has_people: boolean;
    author: { id: string; handle: string } | null;
  } | null;
};

const REPORT_SELECT = `id, reason, detail, photo_position, status, created_at, resolved_at,
  reporter:profiles!reports_reporter_id_fkey(handle, created_at),
  post:posts!reports_post_id_fkey(id, title, status, held_at, held_reason, has_people, author:profiles!posts_author_id_fkey(id, handle))`;

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const params = await searchParams;
  const tab = params.tab === "done" || params.tab === "appeals" ? params.tab : "open";
  const selected = typeof params.post === "string" ? params.post : null;
  const supabase = await createClient();

  // 운영자는 RLS상 모든 신고 · 게시물을 본다
  const { data, error } = await supabase
    .from("reports")
    .select(REPORT_SELECT)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) throw error;
  const open = data as unknown as ReportRow[];

  const groups = [...Map.groupBy(open.filter((r) => r.post), (r) => r.post!.id).values()]
    .map((reports) => ({ post: reports[0]!.post!, reports, status: queueStatus(reports) }))
    .sort(
      (a, b) =>
        Number(b.status.urgent) - Number(a.status.urgent) ||
        Number(b.status.overdue) - Number(a.status.overdue) ||
        b.status.elapsedHours - a.status.elapsedHours,
    );

  const done =
    tab === "done"
      ? (((
          await supabase
            .from("reports")
            .select(REPORT_SELECT)
            .neq("status", "open")
            .order("resolved_at", { ascending: false })
            .limit(50)
        ).data ?? []) as unknown as ReportRow[])
      : [];

  const current = selected ? groups.find((g) => g.post.id === selected) ?? null : null;

  // 소명: 검토 대기 (오래된 순)
  const { data: appealRows, error: appealError } = await supabase
    .from("appeals")
    .select(`id, statement, created_at, ${APPEAL_POST}`)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(200);
  if (appealError) throw appealError;
  const appeals = appealRows as unknown as AppealRow[];
  const selectedAppeal = typeof params.appeal === "string" ? appeals.find((a) => a.id === params.appeal) ?? null : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">신고 처리</h1>
        <nav aria-label="신고 보기" className="flex gap-2 text-sm">
          <Link
            href="/admin/reports"
            aria-current={tab === "open" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            대기 {groups.length}
          </Link>
          <Link
            href="/admin/reports?tab=done"
            aria-current={tab === "done" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            처리 완료
          </Link>
          <Link
            href="/admin/reports?tab=appeals"
            aria-current={tab === "appeals" ? "page" : undefined}
            className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
          >
            소명 {appeals.length}
          </Link>
        </nav>
      </header>

      {tab === "open" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section aria-label="대기열">
            {groups.length === 0 ? (
              <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">처리할 신고가 없어요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {groups.map(({ post, reports, status }) => (
                  <li key={post.id}>
                    <Link
                      href={`/admin/reports?post=${post.id}`}
                      aria-current={selected === post.id ? "true" : undefined}
                      className="flex flex-col gap-1 rounded-xl border border-line p-3 hover:border-quiet aria-[current=true]:border-accent"
                    >
                      <span className="flex items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${status.urgent ? "bg-red-500/20 text-red-300" : "bg-slot text-quiet"}`}>
                          {status.urgent ? "최우선" : "일반"}
                        </span>
                        <span className="text-quiet">{REASON_LABEL[reports[0]!.reason].title}</span>
                        {post.held_at && <span className="text-amber-300">임시 비공개</span>}
                      </span>
                      <span className="truncate font-medium">{post.title}</span>
                      <span className={`text-xs ${status.overdue ? "font-semibold text-red-300" : "text-quiet"}`}>
                        신고 {reports.length}건 · 접수 {Math.floor(status.elapsedHours)}시간 경과 · 목표 {status.targetHours}시간
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="처리" className="flex flex-col gap-5">
            {current ? <ReportDetail group={current} /> : <p className="text-sm text-quiet">왼쪽에서 신고를 고르세요.</p>}
          </section>
        </div>
      ) : tab === "appeals" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <section aria-label="소명 대기열">
            {appeals.length === 0 ? (
              <p className="rounded-xl border border-line p-6 text-center text-sm text-quiet">검토할 소명이 없어요.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {appeals.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/admin/reports?tab=appeals&appeal=${a.id}`}
                      aria-current={selectedAppeal?.id === a.id ? "true" : undefined}
                      className="flex flex-col gap-1 rounded-xl border border-line p-3 hover:border-quiet aria-[current=true]:border-accent"
                    >
                      <span className="text-xs text-amber-300">{a.post?.removed_at ? "게시 중단" : "임시 비공개"}</span>
                      <span className="truncate font-medium">{a.post?.title}</span>
                      <span className="text-xs text-quiet">
                        @{a.post?.author?.handle ?? "?"} · 접수 {timeFormat.format(new Date(a.created_at))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-label="소명 처리" className="flex flex-col gap-5">
            {selectedAppeal?.post ? (
              <AppealDetail appeal={selectedAppeal} post={selectedAppeal.post} />
            ) : (
              <p className="text-sm text-quiet">왼쪽에서 소명을 고르세요.</p>
            )}
          </section>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {done.length === 0 && <p className="text-sm text-quiet">처리한 신고가 아직 없어요.</p>}
          {done.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line p-3 text-sm">
              <span className={r.status === "dismissed" ? "text-quiet" : "text-emerald-400"}>{r.status === "dismissed" ? "기각" : "조치"}</span>
              <span className="font-medium">{r.post?.title}</span>
              <span className="text-quiet">{REASON_LABEL[r.reason].title}</span>
              <span className="text-xs text-quiet">처리 {r.resolved_at ? timeFormat.format(new Date(r.resolved_at)) : "-"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type AppealRow = {
  id: string;
  statement: string;
  created_at: string;
  post: {
    id: string;
    title: string;
    status: string;
    held_at: string | null;
    held_reason: string | null;
    removed_at: string | null;
    has_people: boolean;
    author: { id: string; handle: string } | null;
  } | null;
};

const APPEAL_POST = `post:posts!appeals_post_id_fkey(id, title, status, held_at, held_reason, removed_at, has_people,
  author:profiles!posts_author_id_fkey(id, handle))`;

async function AppealDetail({ appeal, post }: { appeal: AppealRow; post: NonNullable<AppealRow["post"]> }) {
  const supabase = await createClient();
  const [photos, reports, consents] = await Promise.all([
    supabase.from("photos").select("storage_key, width, height, position").eq("post_id", post.id).order("position").limit(1),
    supabase.from("reports").select("id, reason, detail, status, created_at").eq("post_id", post.id).order("created_at"),
    supabase.from("consent_records").select("subject_label, consented_on, has_minor").eq("post_id", post.id),
  ]);
  const photo = photos.data?.[0];
  const sources = photo ? await photoSources(photo, ["400", "1200"]) : null;
  const removed = Boolean(post.removed_at);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
        {photo && sources ? (
          <BlurredPreview sources={sources} width={photo.width} height={photo.height} />
        ) : (
          <div className="aspect-square rounded-xl bg-slot" />
        )}
        <div className="flex flex-col gap-1.5 text-sm">
          <Link href={`/p/${post.id}`} className="text-lg font-semibold hover:underline">
            {post.title}
          </Link>
          {post.author && (
            <Link href={`/admin/members/${post.author.id}`} className="text-quiet hover:underline">
              업로더 @{post.author.handle} · 회원 관리
            </Link>
          )}
          <span className="text-quiet">상태: {removed ? "게시 중단" : `임시 비공개 (${post.held_reason ?? ""})`}</span>
          <span className="text-quiet">
            촬영 동의 기록:{" "}
            {consents.data?.length
              ? consents.data.map((c) => `${c.subject_label} · ${c.consented_on}${c.has_minor ? " · 미성년자" : ""}`).join(", ")
              : post.has_people
                ? "없음"
                : "해당 없음"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">소명 내용</h2>
        <p className="whitespace-pre-line rounded-xl border border-line p-3 text-sm">{appeal.statement}</p>
      </div>

      {reports.data && reports.data.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">이 게시물의 신고 ({reports.data.length}건)</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {reports.data.map((r) => (
              <li key={r.id} className="rounded-lg border border-line px-3 py-2">
                {REASON_LABEL[r.reason as ReportReason].title}
                <span className="text-xs text-quiet"> · {timeFormat.format(new Date(r.created_at))} · {r.status === "open" ? "대기" : r.status === "dismissed" ? "기각" : "조치"}</span>
                {r.detail && <span className="mt-1 block whitespace-pre-line text-quiet">{r.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="rounded-xl bg-slot p-3 text-xs leading-relaxed text-quiet">
        조치를 풀면 소명을 받아들인 것으로, 유지하면 거절한 것으로 처리되고 업로더에게 알림이 가요. 처리 사유는 내부 기록이에요.
      </p>
      <DecisionForm
        postId={post.id}
        options={removed ? ["restore", "hide"] : ["release", "hold", "hide"]}
        backHref="/admin/reports?tab=appeals"
      />
    </>
  );
}

async function ReportDetail({ group }: { group: { post: NonNullable<ReportRow["post"]>; reports: ReportRow[] } }) {
  const { post, reports } = group;
  const supabase = await createClient();
  const [photos, consents] = await Promise.all([
    supabase.from("photos").select("storage_key, width, height, position").eq("post_id", post.id).order("position"),
    supabase.from("consent_records").select("subject_label, consented_on, has_minor, guardian_consent").eq("post_id", post.id),
  ]);
  // 신고자가 지목한 사진이 있으면 그 사진을, 없으면 대표 사진을
  const pointed = reports.find((r) => r.photo_position !== null)?.photo_position ?? 0;
  const photo = photos.data?.find((p) => p.position === pointed) ?? photos.data?.[0];
  const sources = photo ? await photoSources(photo, ["400", "1200"]) : null;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
        {photo && sources ? (
          <BlurredPreview sources={sources} width={photo.width} height={photo.height} />
        ) : (
          <div className="aspect-square rounded-xl bg-slot" />
        )}
        <div className="flex flex-col gap-1.5 text-sm">
          <Link href={`/p/${post.id}`} className="text-lg font-semibold hover:underline">
            {post.title}
          </Link>
          {post.author && (
            <span className="flex flex-wrap gap-x-3 text-quiet">
              <Link href={profileHref(post.author.handle)} className="hover:underline">
                업로더 @{post.author.handle}
              </Link>
              <Link href={`/admin/members/${post.author.id}`} className="underline underline-offset-2">
                회원 관리
              </Link>
            </span>
          )}
          <span className="text-quiet">
            사진 {photos.data?.length ?? 0}장{reports.some((r) => r.photo_position !== null) && ` · ${pointed + 1}번째 사진 지목`}
          </span>
          <span className="text-quiet">
            상태: {post.status === "hidden" ? "게시 중단" : post.held_at ? `임시 비공개 (${post.held_reason ?? ""})` : "공개"}
          </span>
          <span className="text-quiet">
            촬영 동의 기록:{" "}
            {consents.data?.length
              ? consents.data.map((c) => `${c.subject_label} · ${c.consented_on}${c.has_minor ? " · 미성년자(보호자 동의)" : ""}`).join(", ")
              : post.has_people
                ? "없음"
                : "해당 없음 (사람 없는 사진)"}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">신고 내용 ({reports.length}건)</h2>
        <ol className="flex flex-col gap-2">
          {reports.map((r, i) => (
            <li key={r.id} className="rounded-xl border border-line p-3 text-sm">
              <p>
                {i + 1}. {REASON_LABEL[r.reason].title}
                {r.photo_position !== null && <span className="text-quiet"> · {r.photo_position + 1}번째 사진</span>}
              </p>
              <p className="text-xs text-quiet">
                신고자 @{r.reporter?.handle ?? "?"}
                {r.reporter && ` (가입 ${timeFormat.format(new Date(r.reporter.created_at))})`} · 접수 {timeFormat.format(new Date(r.created_at))}
              </p>
              {r.detail && <p className="mt-1.5 whitespace-pre-line">{r.detail}</p>}
            </li>
          ))}
        </ol>
      </div>

      <p className="rounded-xl bg-slot p-3 text-xs leading-relaxed text-quiet">
        판단 도움말: 초상권 신고는 촬영 동의 기록과 대조해요. 동의 기록이 있어도 본인이 철회를 원하면 게시 중단을 우선해요.
        미성년자 관련은 접수 즉시 임시 비공개됐어요. 불법 촬영물이 의심되면 게시 중단 후 원본을 보존하고 수사기관 협조 절차를 따르세요.
      </p>

      <DecisionForm postId={post.id} options={post.held_at ? ["dismiss", "hold", "hide", "release"] : ["dismiss", "hold", "hide"]} />
    </>
  );
}

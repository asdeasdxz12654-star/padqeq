import Link from "next/link";
import { REASON_LABEL, type ReportReason } from "@/lib/moderation/reasons";
import { photoSources } from "@/lib/photos/server";
import { profileHref } from "@/lib/profiles/profile-href";
import { getViewer } from "@/lib/auth/viewer";
import { createClient } from "@/lib/supabase/server";
import { BlurredPreview } from "./blurred-preview";
import { DecisionForm } from "./decision-form";
import { EvidenceImage } from "./evidence-image";
import { KST } from "@/lib/format/kst";

// 신고 · 소명 상세 (신고 처리 화면과 처리함 오른쪽 칸이 함께 쓴다)

const timeFormat = KST.dateTimeShort;

export type ReportRow = {
  id: string;
  reason: ReportReason;
  detail: string;
  photo_position: number | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
  reporter: { id: string; handle: string; created_at: string } | null;
  evidence: { id: string; uploaded_at: string | null }[];
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

export const REPORT_SELECT = `id, reason, detail, photo_position, status, created_at, resolved_at,
  evidence:report_evidence(id, uploaded_at),
  reporter:profiles!reports_reporter_id_fkey(id, handle, created_at),
  post:posts!reports_post_id_fkey(id, title, status, held_at, held_reason, has_people, author:profiles!posts_author_id_fkey(id, handle))`;

export type AppealRow = {
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

export const APPEAL_POST = `post:posts!appeals_post_id_fkey(id, title, status, held_at, held_reason, removed_at, has_people,
  author:profiles!posts_author_id_fkey(id, handle))`;

export async function AppealDetail({ appeal, post, backHref = "/admin/reports?tab=appeals" }: { appeal: AppealRow; post: NonNullable<AppealRow["post"]>; backHref?: string }) {
  const supabase = await createClient();
  const [photos, reports, consents, evidence] = await Promise.all([
    supabase.from("photos").select("storage_key, width, height, position").eq("post_id", post.id).order("position").limit(1),
    supabase.from("reports").select("id, reason, detail, status, created_at").eq("post_id", post.id).order("created_at"),
    supabase.from("consent_records").select("subject_label, consented_on, has_minor").eq("post_id", post.id),
    supabase.from("appeal_evidence").select("id").eq("appeal_id", appeal.id).not("uploaded_at", "is", null).order("created_at"),
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
        {evidence.data && evidence.data.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {evidence.data.map((e, n) => (
              <EvidenceImage key={e.id} id={e.id} index={n + 1} kind="appeals" />
            ))}
          </div>
        )}
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
        backHref={backHref}
      />
    </>
  );
}

export async function ReportDetail({ group, backHref }: { group: { post: NonNullable<ReportRow["post"]>; reports: ReportRow[] }; backHref?: string }) {
  const { post, reports } = group;
  const supabase = await createClient();
  const isAdmin = (await getViewer())?.profile?.role === "admin";
  const reporterIds = [...new Set(reports.flatMap((r) => (r.reporter ? [r.reporter.id] : [])))];
  const [photos, consents, reporterStats] = await Promise.all([
    supabase.from("photos").select("storage_key, width, height, position").eq("post_id", post.id).order("position"),
    supabase.from("consent_records").select("subject_label, consented_on, has_minor, guardian_consent").eq("post_id", post.id),
    // 신고자 이력 (허위 신고 판단용)
    reporterIds.length ? supabase.rpc("admin_reporter_stats", { ids: reporterIds }) : Promise.resolve({ data: [] }),
  ]);
  const statsOf = (id: string | undefined) => reporterStats.data?.find((s) => s.reporter_id === id);
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
            {!isAdmin
              ? post.has_people
                ? "최고 관리자만 볼 수 있어요"
                : "해당 없음 (사람 없는 사진)"
              : consents.data?.length
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
              {(() => {
                const s = statsOf(r.reporter?.id);
                if (!s) return null;
                return (
                  <p className={`text-xs ${s.unreliable ? "text-warn" : "text-quiet"}`}>
                    신고 이력 {s.total}건 · 조치 {s.actioned} · 기각 {s.dismissed}
                    {s.unreliable && " · 기각이 많아 자동 임시 비공개 인원에 세지 않아요"}
                  </p>
                );
              })()}
              {r.detail && <p className="mt-1.5 whitespace-pre-line">{r.detail}</p>}
              {r.evidence.some((e) => e.uploaded_at) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {r.evidence
                    .filter((e) => e.uploaded_at)
                    .map((e, n) => (
                      <EvidenceImage key={e.id} id={e.id} index={n + 1} />
                    ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <p className="rounded-xl bg-slot p-3 text-xs leading-relaxed text-quiet">
        판단 도움말: 초상권 신고는 촬영 동의 기록과 대조해요. 동의 기록이 있어도 본인이 철회를 원하면 게시 중단을 우선해요.
        미성년자 관련은 접수 즉시 임시 비공개됐어요. 불법 촬영물이 의심되면 게시 중단 후 원본을 보존하고 수사기관 협조 절차를 따르세요.
      </p>

      <DecisionForm postId={post.id} options={post.held_at ? ["dismiss", "hold", "hide", "release", "quarantine"] : ["dismiss", "hold", "hide", "quarantine"]} backHref={backHref} />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getViewer } from "@/lib/auth/viewer";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { isUuid } from "@/lib/ids";
import { REASON_LABEL, type ReportReason } from "@/lib/moderation/reasons";
import { escapeLike } from "@/lib/posts/feed-params";
import { createClient } from "@/lib/supabase/server";
import { TAG_KIND_LABEL } from "@/lib/tags/tag-rules";
import { KST } from "@/lib/format/kst";

export const metadata: Metadata = { title: "운영 검색" };

// A-01 ③ 운영 전체 검색: 게시물 ID · 신고 번호 · 소명 번호 · 회원 ID(UUID) / @핸들 / 제목 · 태그 · 이름
// 볼 수 있는 것만 나온다 (운영 도우미는 RLS상 휴지통 · 소명 · 이메일이 빠진다).

const timeFormat = KST.date;

export default async function AdminSearchPage({ searchParams }: PageProps<"/admin/search">) {
  const raw = (await searchParams).q;
  // PostgREST 필터 문법에 쓰이는 문자는 지운다 (검색어가 조건을 바꾸지 못하게)
  const q = (typeof raw === "string" ? raw : "").normalize("NFC").replace(/[,()*%\\:"']/g, "").trim().slice(0, 60);
  const isAdmin = (await getViewer())?.profile?.role === "admin";
  const supabase = await createClient();

  const id = isUuid(q.toLowerCase()) ? q.toLowerCase() : null;
  const handle = q.startsWith("@") ? q.slice(1).toLowerCase() : null;
  const text = !id && !handle && q ? q : null;
  const like = text ? `%${escapeLike(text)}%` : null;
  // or() 필터 안에서는 점(.)도 뺀다 (회원 목록과 같은 기준)
  const orText = (text ?? "").replaceAll(".", "");

  const [posts, members, tags, reports, appeals] = q
    ? await Promise.all([
        id
          ? supabase.from("posts").select("id, title, status, created_at, author:profiles!posts_author_id_fkey(handle)").eq("id", id)
          : like
            ? supabase.from("posts").select("id, title, status, created_at, author:profiles!posts_author_id_fkey(handle)").ilike("title", like).order("created_at", { ascending: false }).limit(20)
            : Promise.resolve({ data: [] }),
        id
          ? supabase.from("profiles").select("id, handle, display_name, role").eq("id", id)
          : handle
            ? supabase.from("profiles").select("id, handle, display_name, role").ilike("handle", `${escapeLike(handle)}%`).order("handle").limit(20)
            : like
              ? supabase.from("profiles").select("id, handle, display_name, role").or(`handle.ilike.*${orText}*,display_name.ilike.*${orText}*`).limit(20)
              : Promise.resolve({ data: [] }),
        like
          ? supabase.from("tags").select("id, slug, name, kind, status").ilike("name", like).order("name").limit(20)
          : Promise.resolve({ data: [] }),
        id ? supabase.from("reports").select("id, post_id, reason, status, created_at").or(`id.eq.${id},post_id.eq.${id}`).limit(20) : Promise.resolve({ data: [] }),
        id && isAdmin ? supabase.from("appeals").select("id, post_id, status, created_at").or(`id.eq.${id},post_id.eq.${id}`).limit(20) : Promise.resolve({ data: [] }),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const postRows = posts.data ?? [];
  const memberRows = members.data ?? [];
  const tagRows = tags.data ?? [];
  const reportRows = reports.data ?? [];
  const appealRows = appeals.data ?? [];
  const total = postRows.length + memberRows.length + tagRows.length + reportRows.length + appealRows.length;
  const section = "flex flex-col gap-2";
  const row = "flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-line px-4 py-3 text-sm hover:border-quiet";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-bold">운영 검색</h1>
      {!q ? (
        <p className="text-sm leading-relaxed text-quiet">
          게시물 ID · 신고 번호 · 회원 ID를 붙여 넣거나, @핸들, 게시물 제목 · 태그 · 회원 이름으로 찾아요. 위 검색창을 쓰세요.
        </p>
      ) : total === 0 ? (
        <p className="py-12 text-center text-sm text-quiet">&lsquo;{q}&rsquo;에 맞는 결과가 없어요.</p>
      ) : (
        <>
          {postRows.length > 0 && (
            <section aria-labelledby="r-posts" className={section}>
              <h2 id="r-posts" className="text-sm font-semibold">게시물 {postRows.length}</h2>
              {postRows.map((p) => (
                <Link key={p.id} href={isAdmin ? `/admin/posts/${p.id}` : `/p/${p.id}`} className={row}>
                  <span className="font-medium">{p.title}</span>
                  <span className="text-xs text-quiet">
                    @{p.author?.handle ?? "?"} · {p.status} · {timeFormat.format(new Date(p.created_at))}
                    {isAdmin && " · 처리 이력"}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {reportRows.length > 0 && (
            <section aria-labelledby="r-reports" className={section}>
              <h2 id="r-reports" className="text-sm font-semibold">신고 {reportRows.length}</h2>
              {reportRows.map((r) => (
                <Link key={r.id} href={r.status === "open" ? `/admin/reports?post=${r.post_id}` : isAdmin ? `/admin/posts/${r.post_id}` : `/p/${r.post_id}`} className={row}>
                  <span className="font-medium">{REASON_LABEL[r.reason as ReportReason]?.title ?? r.reason}</span>
                  <span className="text-xs text-quiet">
                    {r.status === "open" ? "대기" : r.status === "actioned" ? "조치" : "기각"} · {timeFormat.format(new Date(r.created_at))} · #{r.id.slice(0, 8)}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {appealRows.length > 0 && (
            <section aria-labelledby="r-appeals" className={section}>
              <h2 id="r-appeals" className="text-sm font-semibold">소명 {appealRows.length}</h2>
              {appealRows.map((a) => (
                <Link key={a.id} href={a.status === "open" ? `/admin/reports?tab=appeals&appeal=${a.id}` : `/admin/posts/${a.post_id}`} className={row}>
                  <span className="font-medium">{a.status === "open" ? "검토 대기" : a.status === "accepted" ? "받아들임" : "조치 유지"}</span>
                  <span className="text-xs text-quiet">
                    {timeFormat.format(new Date(a.created_at))} · #{a.id.slice(0, 8)}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {memberRows.length > 0 && (
            <section aria-labelledby="r-members" className={section}>
              <h2 id="r-members" className="text-sm font-semibold">회원 {memberRows.length}</h2>
              {memberRows.map((m) => (
                <Link key={m.id} href={`/admin/members/${m.id}`} className={row}>
                  <span className="font-medium">@{m.handle}</span>
                  <span className="text-xs text-quiet">
                    {m.display_name}
                    {m.role !== "member" && ` · ${ROLE_LABEL[m.role]}`}
                  </span>
                </Link>
              ))}
            </section>
          )}
          {tagRows.length > 0 && (
            <section aria-labelledby="r-tags" className={section}>
              <h2 id="r-tags" className="text-sm font-semibold">태그 {tagRows.length}</h2>
              {tagRows.map((t) => (
                <Link key={t.id} href={`/t/${encodeURIComponent(t.slug)}`} className={row}>
                  <span className="font-medium">{t.name}</span>
                  <span className="text-xs text-quiet">
                    {TAG_KIND_LABEL[t.kind]}
                    {t.status === "pending" && " · 승인 대기"}
                  </span>
                </Link>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

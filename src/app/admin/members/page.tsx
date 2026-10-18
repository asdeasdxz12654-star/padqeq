import { ROLE_LABEL } from "@/lib/auth/roles";
import type { Metadata } from "next";
import Link from "next/link";
import { isActiveRestriction } from "@/lib/moderation/sanctions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "회원 관리" };

// A-05 회원 관리: 찾기 · 업로드 권한 · 이용 정지 (운영자는 RLS상 모든 프로필 · 정지 기록을 본다)

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

const FILTERS = { all: "전체", uploaders: "업로드 권한", suspended: "정지 중" } as const;
type Filter = keyof typeof FILTERS;

type MemberRow = {
  id: string;
  handle: string;
  display_name: string;
  role: "member" | "admin" | "moderator";
  can_upload: boolean;
  created_at: string;
  deletion_requested_at: string | null;
  restriction: { suspended_until: string } | null;
  posts: { count: number }[];
};

export default async function AdminMembersPage({ searchParams }: PageProps<"/admin/members">) {
  const params = await searchParams;
  const filter: Filter = params.f === "uploaders" || params.f === "suspended" ? params.f : "all";
  // PostgREST 필터 문법에 쓰이는 문자는 지운다 (검색어가 조건을 바꾸지 못하게)
  const q = (typeof params.q === "string" ? params.q : "").replace(/[,()*%\\:."']/g, "").trim().slice(0, 40);
  const now = new Date().toISOString();
  const supabase = await createClient();

  let query = supabase
    .from("profiles")
    .select(
      "id, handle, display_name, role, can_upload, created_at, deletion_requested_at, restriction:member_restrictions!member_restrictions_member_id_fkey(suspended_until), posts!posts_author_id_fkey(count)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) query = query.or(`handle.ilike.*${q}*,display_name.ilike.*${q}*`);
  if (filter === "uploaders") query = query.eq("can_upload", true);
  if (filter === "suspended") {
    const { data: ids, error } = await supabase.from("member_restrictions").select("member_id").gt("suspended_until", now).limit(500);
    if (error) throw error;
    query = query.in("id", ids.map((r) => r.member_id));
  }
  const { data, error } = await query;
  if (error) throw error;
  const members = data as unknown as MemberRow[];

  const filterHref = (f: Filter) => {
    const search = new URLSearchParams({ ...(f !== "all" && { f }), ...(q && { q }) }).toString();
    return search ? `/admin/members?${search}` : "/admin/members";
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">회원 관리</h1>
        <Link href="/admin/reports" className="text-sm text-quiet underline underline-offset-2">
          신고 처리로
        </Link>
      </header>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <form action="/admin/members" className="flex gap-2 md:w-80">
          {filter !== "all" && <input type="hidden" name="f" value={filter} />}
          <label className="sr-only" htmlFor="member-q">
            핸들 · 이름 검색
          </label>
          <input
            id="member-q"
            name="q"
            defaultValue={q}
            placeholder="핸들 · 이름"
            maxLength={40}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
          />
          <button type="submit" className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm hover:border-quiet">
            찾기
          </button>
        </form>
        <nav aria-label="회원 보기" className="flex gap-2 text-sm">
          {(Object.keys(FILTERS) as Filter[]).map((f) => (
            <Link
              key={f}
              href={filterHref(f)}
              aria-current={filter === f ? "page" : undefined}
              className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              {FILTERS[f]}
            </Link>
          ))}
        </nav>
      </div>

      {members.length === 0 ? (
        <p className="py-16 text-center text-sm text-quiet">해당하는 회원이 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {members.map((m) => {
            const suspended = m.restriction !== null && isActiveRestriction(m.restriction.suspended_until);
            return (
              <li key={m.id}>
                <Link href={`/admin/members/${m.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-surface">
                  <span className="min-w-0 font-semibold">
                    <span className="block truncate">{m.display_name}</span>
                    <span className="block text-xs font-normal text-quiet">@{m.handle}</span>
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                    {m.role !== "member" && <span className="rounded-full border border-line px-2 py-0.5">{ROLE_LABEL[m.role]}</span>}
                    {m.can_upload && <span className="rounded-full border border-line px-2 py-0.5">업로드</span>}
                    {suspended && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">정지 중</span>}
                    {m.deletion_requested_at && <span className="rounded-full border border-line px-2 py-0.5 text-quiet">탈퇴 유예</span>}
                    <span className="text-quiet">
                      게시물 {m.posts[0]?.count ?? 0} · {dateFormat.format(new Date(m.created_at))} 가입
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {members.length === 100 && <p className="text-xs text-quiet">최근 가입한 100명까지 보여요. 검색으로 좁혀 주세요.</p>}
    </div>
  );
}

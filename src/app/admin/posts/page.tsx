import { requireTopAdmin } from "@/lib/auth/require-admin";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import { escapeLike } from "@/lib/posts/feed-params";
import { createClient } from "@/lib/supabase/server";
import { type AdminPostRow, PostsTable } from "./posts-table";

export const metadata: Metadata = { title: "게시물 관리" };

// A-03 게시물 관리: 찾기(제목 · 게시물 ID · @업로더) · 상태 · 촬영 연도 · 일괄 작업 · 휴지통(30일)

const PAGE_SIZE = 50;
const STATUS = { all: "전체", published: "게시됨", scheduled: "예약", draft: "임시저장", hidden: "숨김 · 중단", held: "임시 비공개", reported: "신고 있음" } as const;
type Status = keyof typeof STATUS;

export default async function AdminPostsPage({ searchParams }: PageProps<"/admin/posts">) {
  await requireTopAdmin();
  const params = await searchParams;
  const trash = params.view === "trash";
  const status: Status = typeof params.status === "string" && params.status in STATUS ? (params.status as Status) : "all";
  // PostgREST 필터 문법에 쓰이는 문자는 지운다 (검색어가 조건을 바꾸지 못하게)
  const q = (typeof params.q === "string" ? params.q : "").replace(/[,()*%\\:"']/g, "").trim().slice(0, 60);
  const year = typeof params.year === "string" && /^\d{4}$/.test(params.year) ? Number(params.year) : null;
  const page = Math.max(1, Math.min(200, Number(params.page) || 1));
  const now = new Date().toISOString();
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select(
      "id, title, status, category, shot_year, held_at, removed_at, trashed_at, quarantined_at, scheduled_at, published_at, created_at, visibility, author:profiles!posts_author_id_fkey(handle), photos(count), reports!reports_post_id_fkey(count)",
      { count: "exact" },
    )
    .order(trash ? "trashed_at" : "created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  query = trash ? query.not("trashed_at", "is", null) : query.is("trashed_at", null);
  if (!trash) {
    if (status === "published") query = query.eq("status", "published").is("held_at", null).or(`scheduled_at.is.null,scheduled_at.lte."${now}"`);
    if (status === "scheduled") query = query.eq("status", "published").gt("scheduled_at", now);
    if (status === "draft") query = query.eq("status", "draft");
    if (status === "hidden") query = query.eq("status", "hidden");
    if (status === "held") query = query.not("held_at", "is", null);
  }
  if (year) query = query.eq("shot_year", year);

  if (!trash && status === "reported") {
    // 주소 길이 제한 때문에 가장 오래된 신고 300개의 글까지 (그 이상은 신고 처리 화면에서)
    const { data, error } = await supabase.from("reports").select("post_id").eq("status", "open").order("created_at").limit(1000);
    if (error) throw error;
    query = query.in("id", [...new Set(data.map((r) => r.post_id))].slice(0, 300));
  }

  if (q) {
    if (z.uuid().safeParse(q).success) query = query.eq("id", q);
    else if (q.startsWith("@")) {
      const { data: author } = await supabase.from("profiles").select("id").eq("handle", q.slice(1).toLowerCase()).maybeSingle();
      query = query.eq("author_id", author?.id ?? "00000000-0000-0000-0000-000000000000");
    } else query = query.ilike("title", `%${escapeLike(q)}%`);
  }

  const [{ data, count, error }, years] = await Promise.all([query, supabase.from("posts").select("shot_year").order("shot_year", { ascending: false }).limit(1000)]);
  if (error) throw error;
  if (years.error) throw years.error;
  const rows = data as unknown as AdminPostRow[];
  const yearChips = [...new Set(years.data.map((r) => r.shot_year))];
  const total = count ?? rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Record<string, string | number | null>) => {
    const next: Record<string, string> = {};
    const merged = { view: trash ? "trash" : null, status: status === "all" ? null : status, q: q || null, year, page: null, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v !== null && v !== "") next[k] = String(v);
    const search = new URLSearchParams(next).toString();
    return search ? `/admin/posts?${search}` : "/admin/posts";
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">{trash ? "휴지통" : "게시물 관리"}</h1>
        <nav aria-label="보기" className="flex gap-2 text-sm">
          <Link href="/admin/posts" aria-current={!trash ? "page" : undefined} className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg">
            게시물
          </Link>
          <Link href="/admin/posts?view=trash" aria-current={trash ? "page" : undefined} className="rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg">
            휴지통
          </Link>
        </nav>
        {trash && <p className="w-full text-xs text-quiet">휴지통에 넣은 지 30일이 지나면 사진 파일까지 영구 삭제돼요. 그 전에는 복구할 수 있어요.</p>}
      </header>

      <form action="/admin/posts" className="flex gap-2 md:w-[28rem]">
        {trash && <input type="hidden" name="view" value="trash" />}
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        {year && <input type="hidden" name="year" value={year} />}
        <label className="sr-only" htmlFor="post-q">
          제목 · 게시물 ID · @업로더 검색
        </label>
        <input
          id="post-q"
          name="q"
          defaultValue={q}
          placeholder="제목 · 게시물 ID · @업로더"
          maxLength={60}
          className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
        />
        <button type="submit" className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm hover:border-quiet">
          찾기
        </button>
      </form>

      {!trash && (
        <nav aria-label="상태" className="flex gap-2 overflow-x-auto text-sm [scrollbar-width:none]">
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <Link
              key={s}
              href={href({ status: s === "all" ? null : s })}
              aria-current={status === s ? "page" : undefined}
              className="shrink-0 rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              {STATUS[s]}
            </Link>
          ))}
        </nav>
      )}

      {yearChips.length > 1 && (
        <nav aria-label="촬영 연도" className="flex gap-2 overflow-x-auto text-sm [scrollbar-width:none]">
          {[null, ...yearChips].map((y) => (
            <Link
              key={y ?? "all"}
              href={href({ year: y })}
              aria-current={year === y ? "page" : undefined}
              className="shrink-0 rounded-full border border-line px-3 py-1 text-xs aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg"
            >
              {y ?? "전체 연도"}
            </Link>
          ))}
        </nav>
      )}

      <PostsTable
        key={`${trash}-${status}-${q}-${year}-${page}`}
        rows={rows}
        trash={trash}
        categoryLabel={CATEGORY_LABEL}
      />

      <footer className="flex items-center justify-between text-sm text-quiet">
        <span>
          {total.toLocaleString("ko-KR")}개 중 {total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}
        </span>
        <span className="flex gap-2">
          {page > 1 && (
            <Link href={href({ page: page - 1 })} className="rounded-xl border border-line px-3 py-1.5 hover:border-quiet">
              ‹ 이전
            </Link>
          )}
          {page < pages && (
            <Link href={href({ page: page + 1 })} className="rounded-xl border border-line px-3 py-1.5 hover:border-quiet">
              다음 ›
            </Link>
          )}
        </span>
      </footer>
    </div>
  );
}

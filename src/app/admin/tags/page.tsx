import type { Metadata } from "next";
import Link from "next/link";
import { requireTopAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import { findSimilarTags, type SimilarPair } from "@/lib/tags/similar";
import { TAG_KIND_LABEL, type TagKind } from "@/lib/tags/tag-rules";
import { ApproveButton } from "./approve-button";

export const metadata: Metadata = { title: "태그 관리" };

// 태그 관리 (최고 관리자): 목록 · 승인 대기 · 위치 없는 장소/행사 · 비슷한 이름 짝(합치기로 이어짐)

const VIEWS = { all: "전체", pending: "승인 대기", nolocation: "위치 없는 장소 · 행사", similar: "비슷한 이름" } as const;
type View = keyof typeof VIEWS;
const KINDS = Object.keys(TAG_KIND_LABEL) as TagKind[];
const LIST_LIMIT = 200;

type TagRow = {
  id: string;
  kind: TagKind;
  slug: string;
  name: string;
  status: "official" | "pending";
  lat: number | null;
  tag_aliases: { alias: string }[];
  post_tags: { count: number }[];
};

const tagHref = (slug: string) => `/t/${encodeURIComponent(slug)}`;

export default async function AdminTagsPage({ searchParams }: PageProps<"/admin/tags">) {
  await requireTopAdmin();
  const params = await searchParams;
  const view: View = typeof params.view === "string" && params.view in VIEWS ? (params.view as View) : "all";
  const kind = typeof params.kind === "string" && (KINDS as string[]).includes(params.kind) ? (params.kind as TagKind) : null;
  // PostgREST 필터 문법에 쓰이는 문자는 지운다 (검색어가 조건을 바꾸지 못하게)
  const q = (typeof params.q === "string" ? params.q : "").replace(/[,()*%\\:."']/g, "").trim().slice(0, 40);

  const supabase = await createClient();
  let query = supabase
    .from("tags")
    .select("id, kind, slug, name, status, lat, tag_aliases(alias), post_tags(count)")
    .order("created_at", { ascending: false })
    .limit(view === "similar" ? 3000 : LIST_LIMIT);
  if (kind) query = query.eq("kind", kind);
  if (q) query = query.or(`name.ilike.*${q}*,slug.ilike.*${q}*`);
  if (view === "pending") query = query.eq("status", "pending");
  if (view === "nolocation") query = query.in("kind", ["place", "event"]).eq("status", "official").is("lat", null);
  const { data, error } = await query;
  if (error) throw error;
  const tags = data as unknown as TagRow[];
  const posts = (t: TagRow) => t.post_tags[0]?.count ?? 0;

  const pairs =
    view === "similar"
      ? findSimilarTags(tags.map((t) => ({ id: t.id, kind: t.kind, name: t.name, aliases: t.tag_aliases.map((a) => a.alias), posts: posts(t) })))
      : [];
  const byId = new Map(tags.map((t) => [t.id, t]));

  const href = (next: { view?: View; kind?: TagKind | null }) => {
    const v = next.view ?? view;
    const k = next.kind === undefined ? kind : next.kind;
    const search = new URLSearchParams({ ...(v !== "all" && { view: v }), ...(k && { kind: k }), ...(q && { q }) }).toString();
    return search ? `/admin/tags?${search}` : "/admin/tags";
  };
  const chip = "rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-4">
        <h1 className="text-2xl font-bold">태그 관리</h1>
        <Link href="/map" className="text-sm text-quiet underline underline-offset-2">
          촬영 장소 지도
        </Link>
      </header>

      <div className="flex flex-col gap-3">
        <form action="/admin/tags" className="flex gap-2 md:w-96">
          {view !== "all" && <input type="hidden" name="view" value={view} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          <label className="sr-only" htmlFor="tag-q">
            태그 이름 · 주소 검색
          </label>
          <input
            id="tag-q"
            name="q"
            defaultValue={q}
            placeholder="태그 이름 · 주소"
            maxLength={40}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 text-base"
          />
          <button type="submit" className="min-h-11 shrink-0 rounded-xl border border-line px-4 text-sm hover:border-quiet">
            찾기
          </button>
        </form>
        <nav aria-label="태그 보기" className="flex flex-wrap gap-2 text-sm">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={view === v ? "page" : undefined} className={chip}>
              {VIEWS[v]}
            </Link>
          ))}
        </nav>
        <nav aria-label="태그 종류" className="flex flex-wrap gap-2 text-sm">
          <Link href={href({ kind: null })} aria-current={kind === null ? "page" : undefined} className={chip}>
            모든 종류
          </Link>
          {KINDS.map((k) => (
            <Link key={k} href={href({ kind: k })} aria-current={kind === k ? "page" : undefined} className={chip}>
              {TAG_KIND_LABEL[k]}
            </Link>
          ))}
        </nav>
      </div>

      {view === "similar" ? (
        <SimilarList pairs={pairs} byId={byId} />
      ) : tags.length === 0 ? (
        <p className="py-16 text-center text-sm text-quiet">해당하는 태그가 없어요.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
          {tags.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
              <Link href={tagHref(t.slug)} className="min-w-0 flex-1 basis-56 hover:underline">
                <span className="block font-semibold break-words">{t.name}</span>
                {t.tag_aliases.length > 0 && <span className="block text-xs text-quiet">다른 표기: {t.tag_aliases.map((a) => a.alias).join(" · ")}</span>}
              </Link>
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="rounded-full border border-line px-2 py-0.5">{TAG_KIND_LABEL[t.kind]}</span>
                {t.status === "pending" && <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-amber-200">승인 대기</span>}
                {(t.kind === "place" || t.kind === "event") && (
                  <span className={`rounded-full px-2 py-0.5 ${t.lat === null ? "border border-line text-quiet" : "bg-accent/20"}`}>{t.lat === null ? "위치 없음" : "지도에 있음"}</span>
                )}
                <span className="text-quiet">게시물 {posts(t)}</span>
                {t.status === "pending" && <ApproveButton tagId={t.id} name={t.name} />}
              </span>
            </li>
          ))}
        </ul>
      )}
      {view !== "similar" && tags.length === LIST_LIMIT && <p className="text-xs text-quiet">최근 만든 {LIST_LIMIT}개까지 보여요. 검색이나 종류로 좁혀 주세요.</p>}
      {view === "nolocation" && tags.length > 0 && (
        <p className="text-xs text-quiet">태그를 눌러 &lsquo;지도 위치 (운영자)&rsquo;에서 지도를 눌러 위치를 정하면 촬영 장소 지도에 나와요.</p>
      )}
    </div>
  );
}

const REASON_LABEL: Record<SimilarPair["reason"], string> = { same: "이름이 같음", alias: "다른 표기가 겹침", contains: "한쪽 이름이 다른 쪽에 들어 있음" };

function SimilarList({ pairs, byId }: { pairs: SimilarPair[]; byId: Map<string, TagRow> }) {
  if (pairs.length === 0) return <p className="py-16 text-center text-sm text-quiet">비슷한 이름의 태그가 없어요.</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-quiet">
        같은 종류끼리 띄어쓰기 · 괄호 · 대소문자를 무시하고 비교했어요. 같은 대상이 맞을 때만 합쳐 주세요. 남길 태그는 게시물이 많은 쪽으로 골라 두었어요.
      </p>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {pairs.map((p) => {
          let keep = byId.get(p.keep.id)!;
          let drop = byId.get(p.drop.id)!;
          // 합칠 때 남길 태그는 공식이어야 한다
          if (keep.status === "pending" && drop.status === "official") [keep, drop] = [drop, keep];
          const mergeable = keep.status === "official";
          return (
            <li key={`${p.keep.id}-${p.drop.id}`} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                <span className="text-xs text-quiet">
                  {TAG_KIND_LABEL[keep.kind]} · {REASON_LABEL[p.reason]}
                </span>
                <span className="break-words">
                  <span className="text-quiet">남길 태그 </span>
                  <Link href={tagHref(keep.slug)} className="font-semibold hover:underline">
                    {keep.name}
                  </Link>
                  <span className="text-quiet"> (게시물 {keep.post_tags[0]?.count ?? 0}{keep.status === "pending" ? " · 승인 대기" : ""})</span>
                </span>
                <span className="break-words">
                  <span className="text-quiet">없앨 태그 </span>
                  <Link href={tagHref(drop.slug)} className="font-semibold hover:underline">
                    {drop.name}
                  </Link>
                  <span className="text-quiet"> (게시물 {drop.post_tags[0]?.count ?? 0}{drop.status === "pending" ? " · 승인 대기" : ""})</span>
                </span>
              </div>
              {mergeable ? (
                <Link
                  href={`${tagHref(drop.slug)}?merge=${keep.id}#merge`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line px-4 text-sm hover:border-quiet"
                >
                  합치기 화면으로
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-quiet">둘 다 승인 대기예요. 하나를 먼저 승인해 주세요.</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

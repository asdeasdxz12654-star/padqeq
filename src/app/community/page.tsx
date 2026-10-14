import type { Metadata } from "next";
import Link from "next/link";
import { todayKst } from "@/lib/auth/signup-input";
import { getViewer } from "@/lib/auth/viewer";
import { BOARDS, BOARD_LABEL, type BoardKind, CASTING_KIND_LABEL, type CastingKind, type CastingTerms, TERMS_LABEL, isBoard } from "@/lib/boards/labels";
import { REGIONS, formatRange } from "@/lib/events/calendar";
import { upcomingEvents } from "@/lib/events/load";
import { createClient } from "@/lib/supabase/server";
import { Constants } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "커뮤니티" };

// 커뮤니티 탭: 행사 캘린더 · 구인 · 섭외 · 촬영 장소 · 자유 · Q&A · 크리에이터

const timeFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });

type Row = {
  id: string;
  board: BoardKind;
  title: string;
  body: string;
  region: string | null;
  casting_kind: CastingKind | null;
  casting_terms: CastingTerms | null;
  shoot_on: string | null;
  closed_at: string | null;
  created_at: string;
  author: { handle: string } | null;
  replies: { count: number }[];
};

const one = (v: unknown) => (typeof v === "string" ? v : null);

export default async function CommunityPage({ searchParams }: PageProps<"/community">) {
  const params = await searchParams;
  const board = isBoard(params.board) ? params.board : null;
  const region = (REGIONS as readonly string[]).includes(one(params.region) ?? "") ? one(params.region) : null;
  const kind = (Constants.public.Enums.casting_kind as readonly string[]).includes(one(params.kind) ?? "") ? (one(params.kind) as CastingKind) : null;
  const terms = (Constants.public.Enums.casting_terms as readonly string[]).includes(one(params.terms) ?? "") ? (one(params.terms) as CastingTerms) : null;
  const openOnly = params.open === "1";

  const supabase = await createClient();
  let query = supabase
    .from("board_posts")
    .select(
      "id, board, title, body, region, casting_kind, casting_terms, shoot_on, closed_at, created_at, author:profiles!board_posts_author_id_fkey(handle), replies:board_replies(count)",
    )
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(board ? 50 : 20);
  if (board) query = query.eq("board", board);
  if (region && (board === "casting" || board === "places")) query = query.eq("region", region);
  if (board === "casting") {
    if (kind) query = query.eq("casting_kind", kind);
    if (terms) query = query.eq("casting_terms", terms);
    if (openOnly) query = query.is("closed_at", null);
  }
  const [{ data, error }, viewer, events] = await Promise.all([query, getViewer(), board ? Promise.resolve([]) : upcomingEvents(todayKst(), 3)]);
  if (error) throw error;
  const posts = data as unknown as Row[];

  const href = (next: Record<string, string | null>) => {
    const merged = { board, region, kind, terms, open: openOnly ? "1" : null, ...next };
    const search = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null)).toString();
    return search ? `/community?${search}` : "/community";
  };
  const chip = "rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg";

  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">커뮤니티</h1>
        {viewer?.profile && (
          <Link href={`/community/write${board ? `?board=${board}` : ""}`} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent">
            글쓰기
          </Link>
        )}
      </div>

      {!board && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <section aria-labelledby="events-heading" className="rounded-2xl border border-line p-4">
            <h2 id="events-heading" className="flex items-center justify-between font-semibold">
              다가오는 행사
              <Link href="/events" className="text-xs font-normal text-quiet hover:underline">
                캘린더 ›
              </Link>
            </h2>
            {events.length === 0 ? (
              <p className="mt-2 text-sm text-quiet">등록된 행사가 없어요.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link href={`/events/${e.id}`} className="flex gap-2 hover:underline">
                      <span className="w-20 shrink-0 tabular-nums text-quiet">{formatRange(e.starts_on, e.ends_on)}</span>
                      <span className="truncate">{e.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link href="/creators" className="flex flex-col justify-between rounded-2xl border border-line p-4 hover:border-quiet">
            <span className="font-semibold">크리에이터</span>
            <span className="mt-2 text-sm text-quiet">코스어 · 포토그래퍼 · 모델 · 보정 작가를 찾아요. 최근 활동순이에요.</span>
          </Link>
        </div>
      )}

      <nav aria-label="게시판" className="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-sm">
        <Link href="/community" aria-current={!board ? "page" : undefined} className={`${chip} shrink-0`}>
          전체
        </Link>
        {BOARDS.map((b) => (
          <Link key={b} href={`/community?board=${b}`} aria-current={board === b ? "page" : undefined} className={`${chip} shrink-0`}>
            {BOARD_LABEL[b].title}
          </Link>
        ))}
      </nav>
      {board && <p className="mt-3 text-sm text-quiet">{BOARD_LABEL[board].help}</p>}

      {(board === "casting" || board === "places") && (
        <div className="mt-3 flex flex-col gap-2 text-xs">
          {board === "casting" && (
            <div className="flex flex-wrap gap-1.5">
              {Constants.public.Enums.casting_kind.map((k) => (
                <Link key={k} href={href({ kind: kind === k ? null : k })} aria-current={kind === k ? "page" : undefined} className={chip}>
                  {CASTING_KIND_LABEL[k]}
                </Link>
              ))}
              {Constants.public.Enums.casting_terms.map((t) => (
                <Link key={t} href={href({ terms: terms === t ? null : t })} aria-current={terms === t ? "page" : undefined} className={chip}>
                  {TERMS_LABEL[t]}
                </Link>
              ))}
              <Link href={href({ open: openOnly ? null : "1" })} aria-current={openOnly ? "page" : undefined} className={chip}>
                모집 중만
              </Link>
            </div>
          )}
          <form action="/community" className="flex items-center gap-2">
            <input type="hidden" name="board" value={board} />
            {kind && <input type="hidden" name="kind" value={kind} />}
            {terms && <input type="hidden" name="terms" value={terms} />}
            {openOnly && <input type="hidden" name="open" value="1" />}
            <label htmlFor="region-filter">지역</label>
            <select id="region-filter" name="region" defaultValue={region ?? ""} className="min-h-10 rounded-xl border border-line bg-bg px-2 text-sm">
              <option value="">전체</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button type="submit" className="min-h-10 rounded-xl border border-line px-3">
              보기
            </button>
          </form>
        </div>
      )}

      {board === "casting" && (
        <p className="mt-3 rounded-xl bg-slot px-3 py-2 text-xs leading-relaxed text-quiet">
          첫 촬영 전 안전 가이드 — 공개 장소에서 만나고, 촬영 범위 · 결과물 사용 범위를 메시지로 미리 합의하세요. 선입금 요구는 신고 사유예요.
        </p>
      )}

      {posts.length === 0 ? (
        <p className="mt-6 rounded-xl border border-line p-8 text-center text-sm text-quiet">아직 글이 없어요. 첫 글을 남겨 주세요.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {posts.map((p) => (
            <li key={p.id}>
              <Link
                href={`/community/${p.id}`}
                className={`flex flex-col gap-1.5 rounded-xl border border-line p-3 hover:border-quiet ${p.closed_at ? "opacity-50" : ""}`}
              >
                <span className="flex flex-wrap gap-1.5 text-[11px] text-quiet">
                  {!board && <span className="rounded border border-line px-1.5 py-0.5">{BOARD_LABEL[p.board].title}</span>}
                  {p.closed_at && <span className="rounded border border-line px-1.5 py-0.5">마감</span>}
                  {p.region && <span className="rounded border border-line px-1.5 py-0.5">{p.region}</span>}
                  {p.casting_kind && <span className="rounded border border-line px-1.5 py-0.5">{CASTING_KIND_LABEL[p.casting_kind]}</span>}
                  {p.casting_terms && <span className="rounded border border-line px-1.5 py-0.5">{TERMS_LABEL[p.casting_terms]}</span>}
                  {p.shoot_on && <span className="rounded border border-line px-1.5 py-0.5">{p.shoot_on.slice(5).replace("-", ".")}</span>}
                </span>
                <span className="font-medium">{p.title}</span>
                <span className="line-clamp-2 text-sm text-quiet">{p.body}</span>
                <span className="text-xs text-quiet">
                  @{p.author?.handle ?? "?"} · {timeFormat.format(new Date(p.created_at))}
                  {p.board !== "casting" && ` · 답글 ${p.replies[0]?.count ?? 0}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

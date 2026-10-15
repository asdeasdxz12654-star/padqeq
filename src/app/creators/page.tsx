import type { Metadata } from "next";
import Link from "next/link";
import { ProtectedPhoto } from "@/components/protected-photo";
import { REGIONS } from "@/lib/events/calendar";
import { CREDIT_ROLE_LABEL } from "@/lib/photos/credit-input";
import { loadRecentByAuthors } from "@/lib/posts/feed";
import { profileHref } from "@/lib/profiles/profile-href";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "크리에이터" };

// S-17 크리에이터 디렉토리: 직접 올린 회원만 · 최근 활동순 (인기순 없음)

const ROLES = ["cosplayer", "photographer", "model", "retoucher"] as const;
type Role = (typeof ROLES)[number];
const PAGE = 12;

export default async function CreatorsPage({ searchParams }: PageProps<"/creators">) {
  const params = await searchParams;
  const role = (ROLES as readonly string[]).includes(String(params.role)) ? (params.role as Role) : null;
  const region = (REGIONS as readonly string[]).includes(String(params.region)) ? String(params.region) : null;
  const casting = params.casting === "1";
  const page = Math.max(0, Math.min(50, Number.parseInt(String(params.page ?? "0"), 10) || 0));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creator_directory", {
    role_filter: role,
    region_filter: region,
    casting_only: casting,
    max_rows: PAGE + 1,
    skip: page * PAGE,
  });
  if (error) throw error;
  const creators = data.slice(0, PAGE);
  // 대표 사진 3장 (볼 수 있는 공개 글만)
  const covers = await loadRecentByAuthors(creators.map((c) => c.user_id), 3);

  const href = (next: Record<string, string | null>) => {
    const merged = { role, region, casting: casting ? "1" : null, ...next };
    const search = new URLSearchParams(Object.entries(merged).filter((e): e is [string, string] => e[1] !== null)).toString();
    return search ? `/creators?${search}` : "/creators";
  };
  const chip = "rounded-full border border-line px-3 py-1.5 aria-[current=page]:border-text aria-[current=page]:bg-text aria-[current=page]:text-bg";

  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">크리에이터</h1>
        <Link href="/me/creator" className="text-sm text-quiet hover:underline">
          나도 올리기
        </Link>
      </div>
      <p className="mt-2 text-sm text-quiet">직접 올린 회원만 보여요. 최근에 활동한 순서예요.</p>

      <nav aria-label="역할" className="mt-5 flex flex-wrap gap-2 text-sm">
        <Link href={href({ role: null })} aria-current={!role ? "page" : undefined} className={chip}>
          전체
        </Link>
        {ROLES.map((r) => (
          <Link key={r} href={href({ role: r })} aria-current={role === r ? "page" : undefined} className={chip}>
            {CREDIT_ROLE_LABEL[r]}
          </Link>
        ))}
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <form action="/creators" className="flex items-center gap-2">
          {role && <input type="hidden" name="role" value={role} />}
          {casting && <input type="hidden" name="casting" value="1" />}
          <label htmlFor="creator-region">지역</label>
          <select id="creator-region" name="region" defaultValue={region ?? ""} className="min-h-10 rounded-xl border border-line bg-bg px-2 text-sm">
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
        <Link href={href({ casting: casting ? null : "1" })} aria-current={casting ? "page" : undefined} className={chip}>
          섭외 가능만
        </Link>
      </div>

      {creators.length === 0 ? (
        <p className="mt-8 rounded-xl border border-line p-8 text-center text-sm text-quiet">조건에 맞는 크리에이터가 아직 없어요.</p>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {creators.map((c) => (
            <li key={c.user_id} className="relative flex flex-col gap-2 rounded-xl border border-line p-3 hover:border-quiet">
              <div className="grid grid-cols-3 gap-1">
                {[0, 1, 2].map((n) => {
                  const cover = covers.get(c.handle)?.[n]?.cover;
                  return (
                    <div key={n} className="aspect-square overflow-hidden rounded-md bg-slot">
                      {cover && (
                        <ProtectedPhoto
                          sources={cover.sources}
                          alt={cover.alt}
                          width={cover.width}
                          height={cover.height}
                          sizes="(min-width: 1024px) 10vw, 30vw"
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="flex items-baseline gap-2">
                <Link href={profileHref(c.handle)} className="font-semibold after:absolute after:inset-0">
                  @{c.handle}
                </Link>
                <span className="truncate text-sm text-quiet">{c.display_name}</span>
              </p>
              <p className="flex flex-wrap gap-1.5 text-[11px] text-quiet">
                {c.casting_open && <span className="rounded border border-accent px-1.5 py-0.5 text-accent">섭외 가능</span>}
                {c.roles.map((r) => (
                  <span key={r} className="rounded border border-line px-1.5 py-0.5">
                    {CREDIT_ROLE_LABEL[r]}
                  </span>
                ))}
                {c.region && <span className="rounded border border-line px-1.5 py-0.5">{c.region}</span>}
                {c.active_since && <span className="rounded border border-line px-1.5 py-0.5">{c.active_since}년부터</span>}
              </p>
              {c.works && <p className="truncate text-xs text-quiet">{c.works}</p>}
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="쪽" className="mt-6 flex justify-between text-sm">
        {page > 0 ? (
          <Link href={href({ page: String(page - 1) })} className="rounded-full border border-line px-4 py-2">
            ‹ 이전
          </Link>
        ) : (
          <span />
        )}
        {data.length > PAGE && (
          <Link href={href({ page: String(page + 1) })} className="rounded-full border border-line px-4 py-2">
            다음 ›
          </Link>
        )}
      </nav>
    </div>
  );
}

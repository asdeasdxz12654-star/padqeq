import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { PhotoFeed } from "@/components/photo-feed";
import { TagChip } from "@/components/tag-chip";
import { YearChips } from "@/components/year-chips";
import { getViewer } from "@/lib/auth/viewer";
import { loadFeed } from "@/lib/posts/feed";
import { getFollowedTags } from "@/lib/tags/follows";
import { createClient } from "@/lib/supabase/server";
import { TAG_KIND_LABEL } from "@/lib/tags/tag-rules";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";
import { FollowButton } from "./follow-button";

// S-05 태그 허브 (1단계: 계층 · 별칭 · 캐릭터 목록 · 사진 · 촬영 연도).
// 태그 팔로우는 홈 '팔로우' 피드로 이어진다. 인기/최신 탭 · 관련 태그는 반응 기능과 함께.

const getTag = cache(async (rawSlug: string) => {
  let slug: string;
  try {
    slug = decodeURIComponent(rawSlug).normalize("NFC");
  } catch {
    return null;
  }
  if (slug.length > 60) return null;
  const supabase = await createClient();
  // 볼 수 있는 태그만 (공식 · 내 제안 · 운영자, RLS)
  const { data: tag } = await supabase
    .from("tags")
    .select("id, kind, slug, name, status, parent_id, tag_aliases(alias)")
    .eq("slug", slug)
    .maybeSingle();
  if (!tag) return null;

  const [parent, children] = await Promise.all([
    tag.parent_id
      ? supabase.from("tags").select("slug, name, kind").eq("id", tag.parent_id).maybeSingle()
      : Promise.resolve({ data: null }),
    tag.kind === "work"
      ? supabase.from("tags").select("id, slug, name, kind").eq("parent_id", tag.id).order("name").limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  return { ...tag, parent: parent.data, children: children.data ?? [] };
});

export async function generateMetadata({ params }: PageProps<"/t/[slug]">): Promise<Metadata> {
  const tag = await getTag((await params).slug);
  if (!tag) return { title: "찾을 수 없는 태그", robots: { index: false } };
  return {
    title: tag.parent ? `${tag.parent.name} › ${tag.name}` : tag.name,
    robots: tag.status === "official" ? undefined : { index: false },
  };
}

export default async function TagHubPage({ params, searchParams }: PageProps<"/t/[slug]">) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tag = await getTag(slug);
  if (!tag) notFound();
  const year = parseYearParam(query.year);
  const base = `/t/${encodeURIComponent(tag.slug)}`;

  const supabase = await createClient();
  // 작품 허브에는 그 작품 캐릭터 사진도 함께
  const tagIds = [tag.id, ...tag.children.map((c) => c.id)];
  const [years, items, viewer] = await Promise.all([
    supabase.rpc("published_shot_years"),
    loadFeed({ year, category: null, query: null, tagIds }),
    getViewer(),
  ]);
  const following = viewer?.profile ? (await getFollowedTags(viewer.id)).some((t) => t.id === tag.id) : false;
  if (years.error) throw years.error;

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-2 px-4 pt-6 md:px-6">
        <nav aria-label="태그 위치" className="text-sm text-quiet">
          <Link href="/explore" className="hover:text-text">
            탐색
          </Link>
          {tag.parent && (
            <>
              {" › "}
              <Link href={`/t/${encodeURIComponent(tag.parent.slug)}`} className="hover:text-text">
                {tag.parent.name}
              </Link>
            </>
          )}
          {" › "}
          <span>{TAG_KIND_LABEL[tag.kind]}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-2xl font-bold">{tag.kind === "general" ? `#${tag.name}` : tag.name}</h1>
          {viewer?.profile ? (
            <FollowButton tagId={tag.id} initial={following} />
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(base)}`}
              className="inline-flex min-h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent"
            >
              팔로우
            </Link>
          )}
        </div>
        {tag.tag_aliases.length > 0 && (
          <p className="text-sm text-quiet">다른 표기: {tag.tag_aliases.map((a) => a.alias).join(" · ")}</p>
        )}
        {tag.status === "pending" && <p className="text-xs text-quiet">운영자 승인 대기 중인 태그예요.</p>}
      </header>

      {tag.children.length > 0 && (
        <nav aria-label="캐릭터" className="px-4 pt-4 md:px-6">
          <ul className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {tag.children.map((c) => (
              <li key={c.id} className="shrink-0">
                <TagChip tag={c} />
              </li>
            ))}
          </ul>
        </nav>
      )}

      <YearChips
        chips={buildYearChips(years.data.map((r) => r.year))}
        selected={year}
        hrefFor={(y) => (y === null ? base : `${base}?year=${y}`)}
      />

      <PhotoFeed
        items={items}
        empty={year ? `${year}년의 ${tag.name} 사진이 아직 없어요.` : `${tag.name} 사진이 아직 없어요.`}
      />
    </div>
  );
}

import Link from "next/link";
import { ProtectedPhoto } from "@/components/protected-photo";
import { YearChips } from "@/components/year-chips";
import { photoSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

const CATEGORY_LABEL = { cosplay: "코스프레", model: "모델", landscape: "풍경", other: "기타" } as const;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const year = parseYearParam((await searchParams).year);
  const supabase = await createClient();

  let feed = supabase
    .from("posts")
    .select(
      "id, title, category, shot_year, author:profiles!posts_author_id_fkey(handle, display_name), photos(storage_key, width, height, alt_text, is_panorama, position)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("position", { referencedTable: "photos" })
    .limit(1, { referencedTable: "photos" })
    .limit(40);
  if (year !== null) feed = feed.eq("shot_year", year);

  const [years, posts] = await Promise.all([supabase.rpc("published_shot_years"), feed]);
  if (years.error) throw years.error;
  if (posts.error) throw posts.error;

  const chips = buildYearChips(years.data.map((row) => row.year));
  // RLS로 읽어 온(볼 수 있는) 사진에만 서명 주소를 붙인다
  const covers = await Promise.all(
    posts.data.map(async (post) => {
      const cover = post.photos[0];
      return cover ? { photo: cover, sources: await photoSources(cover) } : null;
    }),
  );

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="sr-only">{year ? `${year}년 사진` : "전체 사진"}</h1>
      <YearChips chips={chips} selected={year} />

      {posts.data.length === 0 ? (
        <p className="px-4 py-24 text-center text-quiet md:px-6">
          {year ? `${year}년에 담긴 사진이 아직 없어요.` : "아직 담긴 사진이 없어요."}
        </p>
      ) : (
        <ul className="columns-2 gap-2 px-2 md:columns-3 md:px-6 xl:columns-5 xl:gap-4">
          {posts.data.map((post, index) => {
            const cover = covers[index];
            return (
              <li key={post.id} className="mb-2 break-inside-avoid xl:mb-4">
                <article className="relative">
                  {cover?.sources ? (
                    <div
                      className={`overflow-hidden rounded-lg bg-slot ${cover.photo.is_panorama ? "aspect-[2/1]" : ""}`}
                    >
                      <ProtectedPhoto
                        sources={cover.sources}
                        alt={cover.photo.alt_text || post.title}
                        width={cover.photo.width}
                        height={cover.photo.height}
                        // 피드 열 수: 2 · 3(md) · 5(xl)
                        sizes="(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw"
                        priority={index < 4}
                        className={`block w-full ${cover.photo.is_panorama ? "h-full object-cover" : "h-auto"}`}
                      />
                    </div>
                  ) : (
                    <div role="img" aria-label={post.title} className="aspect-[4/5] rounded-lg bg-slot" />
                  )}
                  <div className="px-1 pt-2 pb-1">
                    <h2 className="truncate text-sm font-medium">
                      {/* 카드 전체를 누를 수 있게 (링크 영역을 카드로 넓힘) */}
                      <Link href={`/p/${post.id}`} className="after:absolute after:inset-0">
                        {post.title}
                      </Link>
                    </h2>
                    <p className="text-xs text-quiet">
                      @{post.author?.handle} · {CATEGORY_LABEL[post.category]} · {post.shot_year}
                    </p>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

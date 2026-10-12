import { YearChips } from "@/components/year-chips";
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
          {posts.data.map((post) => {
            const cover = post.photos[0];
            return (
              <li key={post.id} className="mb-2 break-inside-avoid xl:mb-4">
                <article>
                  {/* 사진은 이미지 게이트(타일 · 워터마크) 연결 후 표시. 지금은 비율만 맞춘 자리 */}
                  <div
                    role="img"
                    aria-label={cover?.alt_text || post.title}
                    className="photo-guard rounded-lg bg-slot"
                    style={{
                      aspectRatio: cover
                        ? cover.is_panorama
                          ? "2 / 1"
                          : `${cover.width} / ${cover.height}`
                        : "4 / 5",
                    }}
                  />
                  <div className="px-1 pt-2 pb-1">
                    <h2 className="truncate text-sm font-medium">{post.title}</h2>
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

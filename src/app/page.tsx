import { PhotoFeed } from "@/components/photo-feed";
import { YearChips } from "@/components/year-chips";
import { loadFeed } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";
import { buildYearChips, parseYearParam } from "@/lib/year-chips";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const year = parseYearParam((await searchParams).year);
  const supabase = await createClient();

  const [years, items] = await Promise.all([
    supabase.rpc("published_shot_years"),
    loadFeed({ year, category: null, query: null }),
  ]);
  if (years.error) throw years.error;

  return (
    <div className="mx-auto max-w-[1440px]">
      <h1 className="sr-only">{year ? `${year}년 사진` : "전체 사진"}</h1>
      <YearChips chips={buildYearChips(years.data.map((row) => row.year))} selected={year} />
      <PhotoFeed items={items} empty={year ? `${year}년에 담긴 사진이 아직 없어요.` : "아직 담긴 사진이 없어요."} />
    </div>
  );
}

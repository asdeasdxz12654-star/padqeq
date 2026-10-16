import type { Metadata } from "next";
import Link from "next/link";
import { type MapPlace, PlaceMap } from "@/components/place-map";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "촬영 장소 지도", description: "공원 · 행사장처럼 사진을 찍은 장소를 지도에서 모아 봐요." };

// S-04 지도 보기: 위치가 있는 장소 · 행사 태그. 사진 속 GPS는 쓰지 않는다 (올릴 때 지움).
export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const { focus } = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_map", { max_rows: 500 });
  if (error) throw error;
  const places: MapPlace[] = data.flatMap((p) =>
    p.kind === "place" || p.kind === "event" ? [{ id: p.id, slug: p.slug, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, posts: Number(p.post_count) }] : [],
  );

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 pt-6 pb-16 md:px-6">
      <header className="flex flex-col gap-1">
        <nav aria-label="위치" className="text-sm text-quiet">
          <Link href="/explore" className="hover:text-text">
            탐색
          </Link>
          {" › "}지도
        </nav>
        <h1 className="text-2xl font-bold">촬영 장소 지도</h1>
        <p className="text-sm text-quiet">장소 · 행사 태그를 지도에서 모아 봐요. 원이 클수록 사진이 많아요. 사진에 담긴 위치 정보는 올릴 때 지워져서 쓰지 않아요.</p>
      </header>

      <PlaceMap places={places} focus={typeof focus === "string" ? focus : null} />

      <section aria-labelledby="place-list" className="flex flex-col gap-2">
        <h2 id="place-list" className="text-base font-semibold">
          장소 목록 <span className="text-sm font-normal text-quiet">{places.length}곳</span>
        </h2>
        {places.length === 0 ? (
          <p className="py-8 text-center text-sm text-quiet">아직 지도에 표시된 장소가 없어요. 운영자가 장소 · 행사 태그에 위치를 달면 여기에 나와요.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {places.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/t/${encodeURIComponent(p.slug)}`}
                  className="flex min-h-11 items-baseline gap-2 rounded-xl border border-line px-3 py-2.5 hover:border-quiet"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-xs text-quiet">
                    {p.kind === "event" ? "행사" : "장소"} · 게시물 {p.posts}개
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

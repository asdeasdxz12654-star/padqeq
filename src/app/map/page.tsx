import type { Metadata } from "next";
import Link from "next/link";
import type { MapPlace } from "@/components/place-map";
import { createClient } from "@/lib/supabase/server";
import { MapExplorer } from "@/components/map-explorer";

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
        <p className="text-sm text-quiet">장소 · 행사 태그를 지도에서 모아 봐요. 원이 클수록 게시물이 많아요. 사진에 담긴 위치 정보는 올릴 때 지워져서 쓰지 않아요.</p>
      </header>

      <MapExplorer places={places} focus={typeof focus === "string" ? focus : null} />
    </div>
  );
}

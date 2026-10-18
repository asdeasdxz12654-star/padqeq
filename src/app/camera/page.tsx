import type { Metadata } from "next";
import Link from "next/link";
import { PhotoFeed } from "@/components/photo-feed";
import { loadFeedByIds } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

// 같은 카메라로 찍은 사진: 상세 화면 촬영 정보 줄의 카메라 이름에서 들어온다.
// 업로더가 촬영 정보를 보여 주기로 한 글만 (posts.show_exif).

const nameOf = (raw: string | string[] | undefined) => (typeof raw === "string" ? raw.replace(/\p{Cc}/gu, "").trim().slice(0, 60) : "");

export async function generateMetadata({ searchParams }: PageProps<"/camera">): Promise<Metadata> {
  const name = nameOf((await searchParams).name);
  return { title: name ? `${name}로 찍은 사진` : "카메라별 사진", robots: { index: false } };
}

export default async function CameraPage({ searchParams }: PageProps<"/camera">) {
  const name = nameOf((await searchParams).name);
  const supabase = await createClient();
  const { data, error } = name
    ? await supabase
        .from("posts")
        .select("id, photos!inner(id)")
        .eq("status", "published")
        .eq("show_exif", true)
        .eq("photos.exif->>camera", name)
        .order("published_at", { ascending: false })
        .limit(80)
    : { data: [], error: null };
  if (error) throw error;
  const items = await loadFeedByIds(data.map((p) => p.id));

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-1 px-4 pt-6 pb-4 md:px-6">
        <nav aria-label="위치" className="text-sm text-quiet">
          <Link href="/explore" className="hover:text-text">
            탐색
          </Link>
          {" › 카메라"}
        </nav>
        <h1 className="font-mono text-2xl font-bold break-all">{name || "카메라"}</h1>
        <p className="text-sm text-quiet">이 카메라로 찍은 사진이에요. 촬영 정보를 보여 주기로 한 글만 모았어요.</p>
      </header>
      <PhotoFeed items={items} empty={name ? "이 카메라로 찍은 사진이 아직 없어요." : "카메라 이름이 없어요."} />
    </div>
  );
}

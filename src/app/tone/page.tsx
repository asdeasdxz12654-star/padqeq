import type { Metadata } from "next";
import Link from "next/link";
import { PhotoFeed } from "@/components/photo-feed";
import { ToneChips } from "@/components/tone-chips";
import { TONE_LABEL, parseTone } from "@/lib/photos/tone";
import { loadFeedByIds } from "@/lib/posts/feed";
import { createClient } from "@/lib/supabase/server";

// 색감으로 찾기: 첫 사진의 대표 색으로 나눈 따뜻한 · 차가운 · 파스텔 · 흑백 · 어두운 사진 (최신 게시순)

export async function generateMetadata({ searchParams }: PageProps<"/tone">): Promise<Metadata> {
  const tone = parseTone((await searchParams).pick);
  return { title: tone ? `${TONE_LABEL[tone]} 색감의 사진` : "색감으로 찾기" };
}

export default async function TonePage({ searchParams }: PageProps<"/tone">) {
  const tone = parseTone((await searchParams).pick);
  const supabase = await createClient();
  const { data, error } = tone ? await supabase.rpc("tone_posts", { pick: tone, max_rows: 80 }) : { data: [], error: null };
  if (error) throw error;
  const items = await loadFeedByIds(data.map((r) => r.post_id));

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-1 px-4 pt-6 md:px-6">
        <nav aria-label="위치" className="text-sm text-quiet">
          <Link href="/explore" className="hover:text-text">
            탐색
          </Link>
          {" › 색감"}
        </nav>
        <h1 className="text-2xl font-bold">{tone ? `${TONE_LABEL[tone]} 색감` : "색감으로 찾기"}</h1>
        <p className="text-sm text-quiet">첫 사진의 대표 색으로 골랐어요. 색이 저장된 사진(새로 올린 사진)부터 모여요.</p>
      </header>
      {/* 이 화면은 위에 제목이 있다 */}
      <ToneChips selected={tone} heading={false} />
      <div className="pt-4">
        <PhotoFeed items={items} empty={tone ? "이 색감의 사진이 아직 없어요." : "위에서 색감을 골라 주세요."} />
      </div>
    </div>
  );
}

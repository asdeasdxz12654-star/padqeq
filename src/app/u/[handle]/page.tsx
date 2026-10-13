import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PhotoFeed } from "@/components/photo-feed";
import { YearChips } from "@/components/year-chips";
import { getViewer } from "@/lib/auth/viewer";
import { loadFeed } from "@/lib/posts/feed";
import { getProfileByHandle } from "@/lib/profiles/get-profile";
import { profileHref } from "@/lib/profiles/profile-href";
import { parseYearParam, VISIBLE_CHIPS } from "@/lib/year-chips";

// S-09 프로필 (1단계: 소개 · 작업물 · 촬영 연도). 주소는 /@handle (next.config.ts에서 연결)
// 팔로우 · 메시지 · 섭외 문의 · 크레딧된 작업 · 컬렉션은 해당 기능과 함께.

const yearFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric" });

export async function generateMetadata({ params }: PageProps<"/u/[handle]">): Promise<Metadata> {
  const profile = await getProfileByHandle((await params).handle);
  if (!profile) return { title: "찾을 수 없는 프로필", robots: { index: false } };
  return {
    title: `${profile.display_name} (@${profile.handle})`,
    description: profile.bio || `해담의 @${profile.handle}`,
    alternates: { canonical: profileHref(profile.handle) },
  };
}

export default async function ProfilePage({ params, searchParams }: PageProps<"/u/[handle]">) {
  const [{ handle }, query] = await Promise.all([params, searchParams]);
  const [profile, viewer] = await Promise.all([getProfileByHandle(handle), getViewer()]);
  if (!profile) notFound();

  const year = parseYearParam(query.year);
  const items = await loadFeed({ year, category: null, query: null, authorId: profile.id });
  const isMe = viewer?.id === profile.id;
  const base = profileHref(profile.handle);
  // 이 회원이 사진을 올린 촬영 연도만 (S-09 ⑥)
  const years = profile.years.toSorted((a, b) => b - a);

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="flex flex-col gap-3 px-4 pt-8 pb-2 md:px-6">
        <div className="flex items-center gap-4">
          <div aria-hidden="true" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-slot text-xl font-bold text-quiet">
            {profile.display_name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{profile.display_name}</h1>
            <p className="flex items-center gap-2 text-sm text-quiet">
              @{profile.handle}
              {profile.role === "admin" && (
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-text">운영자</span>
              )}
            </p>
          </div>
        </div>

        {profile.bio && <p className="max-w-2xl whitespace-pre-line text-sm leading-relaxed">{profile.bio}</p>}

        <p className="text-sm text-quiet">
          게시물 <strong className="text-text">{profile.postCount}</strong> · {yearFormat.format(new Date(profile.created_at))}부터
        </p>

        {isMe && (
          <Link href="/me" className="self-start rounded-full border border-line px-4 py-1.5 text-sm hover:border-quiet">
            프로필 편집
          </Link>
        )}
      </header>

      <h2 className="sr-only">작업물</h2>
      {years.length > 0 && (
        <YearChips
          chips={{ visible: years.slice(0, VISIBLE_CHIPS), older: years.slice(VISIBLE_CHIPS) }}
          selected={year}
          hrefFor={(y) => (y === null ? base : `${base}?year=${y}`)}
        />
      )}
      <PhotoFeed
        items={items}
        empty={isMe ? "아직 올린 사진이 없어요." : year ? `${year}년에 올린 사진이 없어요.` : "아직 올린 사진이 없어요."}
      />
    </div>
  );
}

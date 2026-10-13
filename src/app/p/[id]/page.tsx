import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth/viewer";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import { getPost } from "@/lib/posts/get-post";
import { TagChip } from "@/components/tag-chip";
import { HidePostButton } from "./hide-post-button";
import { PhotoViewer } from "./photo-viewer";
import { WatermarkCheck } from "./watermark-check";

const ROLE_LABEL = {
  cosplayer: "코스어",
  model: "모델",
  photographer: "촬영",
  retoucher: "보정",
  other: "기타",
} as const;

const dateFormat = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium" });

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const post = await getPost((await params).id);
  if (!post) return { title: "볼 수 없는 게시물", robots: { index: false } };
  return {
    title: post.title,
    description: `@${post.author.handle} · ${CATEGORY_LABEL[post.category]} · ${post.shot_year}`,
    // 게시되지 않은 글(초안 · 숨김)은 검색에 넣지 않는다
    robots: post.status === "published" ? undefined : { index: false },
  };
}

// S-06 / S-07 게시물 상세 (1차: 사진 뷰어 · 정보 · 크레딧 · 숨김)
export default async function PostPage({ params }: PageProps<"/p/[id]">) {
  const [post, viewer] = await Promise.all([getPost((await params).id), getViewer()]);
  // 없는 글 · 볼 수 없는 글은 같은 화면 (존재 여부를 드러내지 않음)
  if (!post || post.photos.length === 0) notFound();

  const isAuthor = viewer?.id === post.author_id;
  const canHide = post.status === "published" && (isAuthor || viewer?.profile?.role === "admin");
  // 승인됐거나 외부 표기인 크레딧만 공개. 승인 대기는 작성자에게만 흐리게.
  const credits = post.credits.filter((c) => c.status === "approved" || c.status === "external" || isAuthor);

  return (
    <article className="mx-auto max-w-[1440px] px-0 pt-4 pb-16 md:px-6 md:pt-6">
      {post.status !== "published" && (
        <p className="mx-4 mb-4 rounded-lg border border-line px-3 py-2 text-sm text-quiet md:mx-0">
          {post.status === "draft" ? "아직 게시하지 않은 초안이에요." : "게시를 중단한 글이에요. 다른 사람에게는 보이지 않아요."}
        </p>
      )}

      <div className="md:grid md:grid-cols-[minmax(0,1fr)_320px] md:gap-8">
        <PhotoViewer
          postId={post.id}
          initialPhotos={post.photos}
          watermark={viewer?.profile ? `@${viewer.profile.handle}` : null}
        />

        <div className="mt-6 flex flex-col gap-5 px-4 md:mt-0 md:px-0">
          <header className="flex flex-col gap-2">
            <h1 className="text-xl font-bold leading-snug">{post.title}</h1>
            <p className="text-sm">
              <span className="font-semibold">@{post.author.handle}</span>
              <span className="text-quiet"> · {post.author.display_name}</span>
            </p>
            <p className="text-xs text-quiet">
              {CATEGORY_LABEL[post.category]} · 촬영 {post.shot_on ? dateFormat.format(new Date(post.shot_on)) : `${post.shot_year}년`}
              {post.published_at && ` · 게시 ${dateFormat.format(new Date(post.published_at))}`}
            </p>
          </header>

          {post.body && <p className="whitespace-pre-line text-sm leading-relaxed">{post.body}</p>}

          {post.tags.length > 0 && (
            <ul aria-label="태그" className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <li key={tag.id}>
                  <TagChip tag={tag} />
                </li>
              ))}
            </ul>
          )}

          {credits.length > 0 && (
            <section aria-labelledby="credits-heading" className="flex flex-col gap-2">
              <h2 id="credits-heading" className="text-sm font-semibold">
                크레딧
              </h2>
              <ul className="flex flex-col gap-1.5 text-sm">
                {credits.map((c) => (
                  <li key={c.id} className={`flex gap-3 ${c.status === "pending" ? "opacity-50" : ""}`}>
                    <span className="w-12 shrink-0 text-quiet">{ROLE_LABEL[c.role]}</span>
                    {c.member ? (
                      <span>@{c.member.handle}</span>
                    ) : c.external_url ? (
                      <a href={c.external_url} rel="nofollow noopener noreferrer ugc" target="_blank" className="underline underline-offset-2">
                        {c.external_label}
                      </a>
                    ) : (
                      <span>{c.external_label}</span>
                    )}
                    {c.status === "pending" && <span className="text-xs text-quiet">승인 대기</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <p className="text-xs leading-relaxed text-quiet">
            © @{post.author.handle} · 무단 전재 및 AI 학습 이용 금지
          </p>

          {canHide && <HidePostButton postId={post.id} />}
          {viewer?.profile?.role === "admin" && <WatermarkCheck postId={post.id} />}
        </div>
      </div>
    </article>
  );
}

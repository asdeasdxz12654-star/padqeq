import type { Metadata } from "next";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import { OG_IMAGES } from "@/lib/og";
import { getPost } from "@/lib/posts/get-post";
import { PostDetail } from "./post-detail";

export async function generateMetadata({ params }: PageProps<"/p/[id]">): Promise<Metadata> {
  const post = await getPost((await params).id);
  if (!post) return { title: "볼 수 없는 게시물", robots: { index: false } };
  return {
    title: post.title,
    description: `@${post.author.handle} · ${CATEGORY_LABEL[post.category]} · ${post.shot_year}`,
    openGraph: {
      type: "article",
      title: `${post.title} · 해담`,
      description: `@${post.author.handle}의 ${post.shot_year}년 ${CATEGORY_LABEL[post.category]} 사진 — 해담에서 보기`,
      url: `/p/${post.id}`,
      images: OG_IMAGES,
    },
    // 게시되지 않은 글(초안 · 숨김)은 검색에 넣지 않는다
    robots: post.status === "published" ? undefined : { index: false },
  };
}

// 주소로 바로 들어오거나 새로 고침하면 단독 화면. 피드에서 누르면 @modal 슬롯이 겹쳐 연다 (S-07 ①).
export default async function PostPage({ params }: PageProps<"/p/[id]">) {
  return <PostDetail id={(await params).id} />;
}

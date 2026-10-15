import Link from "next/link";
import { PostDetail } from "@/app/p/[id]/post-detail";
import { PostOverlay } from "@/components/post-overlay";
import { getPost } from "@/lib/posts/get-post";

// 피드 · 프로필 · 태그 화면에서 게시물을 누르면 그 화면 위에 겹쳐 연다 (S-07 ①).
// 주소는 /p/[id]로 바뀌고, 닫으면(뒤로) 보던 자리로 돌아간다. 새로 고침하면 단독 화면.
export default async function PostOverlayPage({ params }: PageProps<"/p/[id]">) {
  const { id } = await params;
  // 그사이 지워졌거나 볼 수 없게 된 글: 뒤 화면을 404로 바꾸지 않고 겹친 창 안에서만 알린다
  const post = await getPost(id);
  return (
    <PostOverlay>
      {post && post.photos.length > 0 ? (
        <PostDetail id={id} />
      ) : (
        <div className="px-4 py-24 text-center">
          <p className="font-semibold">볼 수 없는 게시물이에요</p>
          <p className="mt-2 text-sm text-quiet">지워졌거나 공개 범위가 바뀌었을 수 있어요.</p>
          <Link href="/" className="mt-6 inline-flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline">
            홈으로
          </Link>
        </div>
      )}
    </PostOverlay>
  );
}

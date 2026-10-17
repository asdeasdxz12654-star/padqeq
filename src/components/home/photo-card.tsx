import Link from "next/link";
import type { FeedItem } from "@/lib/posts/feed";
import { CATEGORY_LABEL } from "@/lib/photos/post-input";
import { profileHref } from "@/lib/profiles/profile-href";
import { ProtectedPhoto } from "../protected-photo";
import { Veil } from "../veil";

/** 홈 섹션 카드: 4:5로 같은 크기 (원본 비율은 상세에서). 사진 아래 제목 한 줄 · 작가 한 줄. */
export function PhotoCard({ post, sizes, priority = false, meta }: { post: FeedItem; sizes: string; priority?: boolean; meta?: string }) {
  return (
    <article className="relative">
      <div className="aspect-[4/5] overflow-hidden rounded-xl bg-slot [&_picture]:h-full">
        {post.cover && (
          <Veil postId={post.id} reason={post.cover.veil} fill>
            <ProtectedPhoto
              sources={post.cover.sources}
              alt={post.cover.alt}
              width={post.cover.width}
              height={post.cover.height}
              sizes={sizes}
              priority={priority}
              className="block size-full object-cover"
            />
          </Veil>
        )}
        {post.photoCount > 1 && (
          <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
            {post.photoCount}
            <span className="sr-only">장</span>
          </span>
        )}
      </div>
      <h3 className="truncate px-0.5 pt-2 text-sm font-bold">
        <Link prefetch={false} href={`/p/${post.id}`} className="after:absolute after:inset-0">
          {post.title}
        </Link>
      </h3>
      <p className="truncate px-0.5 text-xs text-quiet">
        <Link prefetch={false} href={profileHref(post.handle)} className="relative z-10 hover:text-text">
          @{post.handle}
        </Link>
        {` · ${meta ?? `${CATEGORY_LABEL[post.category]} · ${post.shotYear}`}`}
      </p>
    </article>
  );
}

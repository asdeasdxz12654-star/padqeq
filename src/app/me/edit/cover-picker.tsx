"use client";

import { useState, useTransition } from "react";
import { ProtectedPhoto } from "@/components/protected-photo";
import type { FeedItem } from "@/lib/posts/feed";
import { setProfileFeature } from "@/app/p/[id]/actions";

/**
 * 프로필 커버 고르기. 내가 올린 사진 중 한 장을 프로필 맨 위에 건다.
 * 전에는 게시물마다 들어가 '커버로 지정'을 눌러야 했다.
 */
export function CoverPicker({ posts, initial }: { posts: FeedItem[]; initial: string | null }) {
  const [current, setCurrent] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (postId: string) => {
    const on = current !== postId;
    startTransition(async () => {
      const result = await setProfileFeature(postId, "cover", on);
      if (result.ok) {
        setCurrent(on ? postId : null);
        setMessage({ ok: true, text: on ? "커버로 걸었어요." : "커버를 내렸어요." });
      } else {
        setMessage({ ok: false, text: result.error });
      }
    });
  };

  if (posts.length === 0) {
    return <p className="text-sm text-quiet">올린 사진이 있어야 커버를 걸 수 있어요.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {posts.map((post) => {
          const chosen = current === post.id;
          return (
            <li key={post.id}>
              <button
                type="button"
                onClick={() => choose(post.id)}
                disabled={pending}
                aria-pressed={chosen}
                className="block w-full cursor-pointer overflow-hidden rounded-xl border-2 border-transparent bg-slot aria-pressed:border-accent [&_picture]:h-full"
              >
                <span className="block aspect-[3/2]">
                  {post.cover && !post.cover.veil && (
                    <ProtectedPhoto
                      sources={post.cover.sources}
                      alt={post.title}
                      width={post.cover.width}
                      height={post.cover.height}
                      sizes="160px"
                      className="block size-full object-cover"
                    />
                  )}
                </span>
                <span className="sr-only">
                  {post.title} {chosen ? "— 지금 커버예요. 누르면 내려요" : "— 누르면 커버로 걸어요"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p role="status" className={`text-sm ${message ? (message.ok ? "text-ok" : "text-danger") : "text-quiet"}`}>
        {message?.text ?? (current ? "지금 커버를 다시 누르면 내려요." : "사진을 누르면 프로필 맨 위에 걸려요.")}
      </p>
    </div>
  );
}

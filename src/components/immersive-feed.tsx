"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { FeedItem } from "@/lib/posts/feed";
import { profileHref } from "@/lib/profiles/profile-href";
import { CATEGORY_LABEL } from "@/lib/photos/categories";
import { ProtectedPhoto } from "./protected-photo";
import { Veil } from "./veil";

// 크게 보기 (몰입 넘기기): 사진 한 장이 화면을 가득 채우고 위아래로 넘긴다.
// 글자는 숨겨 두고 화면을 한 번 누르면 보인다. 끝에 닿으면 다음 페이지를 이어 받는다. Esc · 닫기로 돌아간다.

export function ImmersiveFeed({ items, onNearEnd, hasMore }: { items: FeedItem[]; onNearEnd: () => void; hasMore: boolean }) {
  const [open, setOpen] = useState(false);
  const [captions, setCaptions] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const withCover = items.filter((p) => p.cover);

  // 열려 있는 동안 뒤 화면이 같이 움직이지 않게 · Esc로 닫기 · 닫으면 연 버튼으로 돌아가기
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const back = opener.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
      back?.focus();
    };
  }, [open]);

  // 끝에서 두세 장 남으면 다음 페이지
  useEffect(() => {
    const el = end.current;
    if (!open || !el || !hasMore) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onNearEnd(), { rootMargin: "200% 0px" });
    io.observe(el);
    return () => io.disconnect();
  });

  if (withCover.length < 2) return null;

  return (
    <>
      <div className="flex justify-end px-4 pb-2 md:px-6">
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm hover:border-quiet"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          </svg>
          크게 보기
        </button>
      </div>
      {open &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label="사진 크게 보기" className="stage-dark fixed inset-0 z-50 bg-black text-white">
            <ol className="h-dvh snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
              {withCover.map((post) => (
                <li key={post.id} className="relative flex h-dvh snap-start snap-always items-center justify-center">
                  {/* 사진을 누르면 설명을 보이거나 숨긴다 (키보드는 오른쪽 위 '설명' 버튼) */}
                  <div
                    onClick={(e) => !(e.target as HTMLElement).closest("button, a") && setCaptions((v) => !v)}
                    className="flex size-full items-center justify-center [&_picture]:flex [&_picture]:size-full [&_picture]:items-center [&_picture]:justify-center"
                  >
                    <Veil postId={post.id} reason={post.cover!.veil} fill>
                      <ProtectedPhoto
                        sources={post.cover!.sources}
                        alt={post.cover!.alt}
                        width={post.cover!.width}
                        height={post.cover!.height}
                        sizes="100vw"
                        className="max-h-dvh max-w-full object-contain"
                      />
                    </Veil>
                  </div>
                  <div
                    className={`absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-black/80 to-transparent px-5 pt-16 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-opacity ${captions ? "opacity-100" : "pointer-events-none opacity-0"}`}
                  >
                    <Link prefetch={false} href={`/p/${post.id}`} className="text-lg font-bold underline-offset-4 hover:underline">
                      {post.title}
                    </Link>
                    <p className="text-sm text-white/80">
                      <Link prefetch={false} href={profileHref(post.handle)} className="hover:underline">
                        @{post.handle}
                      </Link>{" "}
                      · {CATEGORY_LABEL[post.category]} · {post.shotYear}
                      {post.photoCount > 1 && ` · 사진 ${post.photoCount}장`}
                    </p>
                  </div>
                </li>
              ))}
              <li className="flex h-40 snap-start items-center justify-center text-sm text-white/70">
                <div ref={end}>{hasMore ? "더 불러오는 중…" : "마지막 사진이에요"}</div>
              </li>
            </ol>
            <button
              type="button"
              aria-pressed={captions}
              onClick={() => setCaptions((v) => !v)}
              className="absolute top-[max(0.75rem,env(safe-area-inset-top))] left-3 min-h-11 rounded-full bg-black/60 px-4 text-sm"
            >
              설명
            </button>
            <button
              ref={closeButton}
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 min-h-11 rounded-full bg-black/60 px-4 text-sm font-semibold"
            >
              닫기
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { setCollectionPost } from "@/lib/collections/actions";
import { isKey, shortcutAllowed } from "@/lib/keyboard";
import { setBookmark } from "./actions";

type CollectionChoice = { id: string; title: string; has: boolean };

const bookmarkIcon = (filled: boolean) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
    <path d="M6 3.5h12v17l-6-4.2-6 4.2z" />
  </svg>
);

/**
 * 저장 (내 공간에 모아 두기). 누르는 즉시 바뀌고, 실패하면 되돌린다.
 * 컬렉션에 담을 수 있는 글(내 글 · 내가 크레딧된 글)이면 저장을 누를 때 작은 창이 열려
 * 저장함과 내 컬렉션을 한곳에서 고른다 (예전에는 ⋯ 안의 '컬렉션에 담기'가 따로 있었다).
 */
export function SaveButton({ postId, initial, collections }: { postId: string; initial: boolean; collections?: CollectionChoice[] }) {
  const [saved, setSaved] = useState(initial);
  const [inCollections, setInCollections] = useState(() => Object.fromEntries((collections ?? []).map((c) => [c.id, c.has])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const savedRef = useRef(initial);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDetailsElement>(null);
  const collected = Object.values(inCollections).filter(Boolean).length;

  const toggle = useCallback(() => {
    const next = !savedRef.current;
    savedRef.current = next;
    setSaved(next);
    setError(null);
    startTransition(async () => {
      const result = await setBookmark(postId, next);
      if (!result.ok) {
        savedRef.current = !next;
        setSaved(!next);
        setError(result.error ?? "처리하지 못했어요.");
      }
    });
  }, [postId]);

  const setCollection = (id: string, add: boolean) => {
    setInCollections((s) => ({ ...s, [id]: add }));
    setError(null);
    startTransition(async () => {
      const result = await setCollectionPost({ collectionId: id, postId, add });
      if (!result.ok) {
        setInCollections((s) => ({ ...s, [id]: !add }));
        setError(result.error);
      }
    });
  };

  // 단축키 S (S-07 ⑦): 저장함에 넣기 · 빼기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shortcutAllowed(e, box.current) && isKey(e, "s", "ㄴ")) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  // 창은 바깥을 누르거나 Esc면 닫힌다
  useEffect(() => {
    if (!collections) return;
    const close = (e: Event) => {
      const d = panel.current;
      if (!d?.open) return;
      if (e instanceof KeyboardEvent) {
        if (e.key === "Escape") d.open = false;
        return;
      }
      if (e.target instanceof Node && d.contains(e.target)) return;
      d.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [collections]);

  const active = saved || collected > 0;
  const buttonClass = `inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${
    active ? "border border-line text-text" : "bg-accent text-on-accent"
  }`;
  const errorLine = error && (
    <p role="alert" className="text-xs text-danger">
      {error}
    </p>
  );

  if (!collections) {
    return (
      <div ref={box} className="flex flex-col items-start gap-1">
        <button type="button" aria-pressed={saved} disabled={pending} onClick={toggle} className={buttonClass}>
          {bookmarkIcon(saved)}
          {saved ? "저장됨" : "저장"}
        </button>
        {errorLine}
      </div>
    );
  }

  return (
    <div ref={box} className="flex flex-col items-start gap-1">
      <details ref={panel} className="relative">
        <summary className={`${buttonClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          {bookmarkIcon(active)}
          {active ? (collected > 0 ? `저장됨 · 컬렉션 ${collected}` : "저장됨") : "저장"}
        </summary>
        <div className="absolute left-0 z-30 mt-2 flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border border-line bg-bg p-3 text-sm shadow-xl">
          <label className="flex min-h-10 items-center gap-2.5">
            <input type="checkbox" checked={saved} disabled={pending} onChange={toggle} className="size-5 accent-[var(--accent)]" />
            <span className="flex-1">
              저장함 <span className="text-xs text-quiet">나만 봐요</span>
            </span>
          </label>
          <p className="mt-2 border-t border-line pt-3 text-xs font-bold text-quiet">내 컬렉션 · 이름 붙인 묶음</p>
          {collections.length === 0 && <p className="py-1 text-xs text-quiet">아직 만든 컬렉션이 없어요.</p>}
          {collections.map((c) => (
            <label key={c.id} className="flex min-h-10 items-center gap-2.5">
              <input
                type="checkbox"
                checked={inCollections[c.id] ?? false}
                disabled={pending}
                onChange={(e) => setCollection(c.id, e.target.checked)}
                className="size-5 accent-[var(--accent)]"
              />
              <span className="truncate">{c.title}</span>
            </label>
          ))}
          <Link href="/me/collections" className="mt-1 self-start text-xs text-quiet underline underline-offset-2 hover:text-text">
            새 컬렉션 만들기
          </Link>
          <p className="text-[11px] leading-relaxed text-quiet">컬렉션에는 내 글과 내가 크레딧된 글을 담을 수 있어요.</p>
        </div>
      </details>
      {errorLine}
    </div>
  );
}

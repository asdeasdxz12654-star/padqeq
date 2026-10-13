"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setCollectionPost } from "@/lib/collections/actions";

/** 컬렉션에 담기 (내 글 · 내가 크레딧된 글). 체크하는 즉시 담기고, 실패하면 되돌린다. */
export function CollectPanel({ postId, collections }: { postId: string; collections: { id: string; title: string; has: boolean }[] }) {
  const [state, setState] = useState(() => Object.fromEntries(collections.map((c) => [c.id, c.has])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const count = Object.values(state).filter(Boolean).length;

  return (
    <details className="rounded-xl border border-line p-3 text-sm">
      <summary className="cursor-pointer">
        컬렉션에 담기 {count > 0 && <span className="text-quiet">· {count}곳에 담김</span>}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {collections.length === 0 && <p className="text-xs text-quiet">아직 만든 컬렉션이 없어요.</p>}
        {collections.map((c) => (
          <label key={c.id} className="flex min-h-9 items-center gap-2">
            <input
              type="checkbox"
              checked={state[c.id] ?? false}
              disabled={pending}
              onChange={(e) => {
                const add = e.target.checked;
                setState((s) => ({ ...s, [c.id]: add }));
                setError(null);
                startTransition(async () => {
                  const result = await setCollectionPost({ collectionId: c.id, postId, add });
                  if (!result.ok) {
                    setState((s) => ({ ...s, [c.id]: !add }));
                    setError(result.error);
                  }
                });
              }}
              className="size-5 accent-[var(--accent)]"
            />
            <span className="truncate">{c.title}</span>
          </label>
        ))}
        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
        <Link href="/me/collections" className="self-start text-xs text-quiet underline underline-offset-2 hover:text-text">
          새 컬렉션 만들기
        </Link>
      </div>
    </details>
  );
}

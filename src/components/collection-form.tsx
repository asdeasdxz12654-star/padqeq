"use client";

import { confirmAction } from "@/lib/ui/confirm";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCollection, deleteCollection, updateCollection } from "@/lib/collections/actions";

const field = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";

/** 컬렉션 만들기(collection 없음) · 고치기와 지우기(collection 있음) */
export function CollectionForm({
  collection,
}: {
  collection?: { id: string; title: string; description: string; isPublic: boolean };
}) {
  const router = useRouter();
  const [title, setTitle] = useState(collection?.title ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [isPublic, setIsPublic] = useState(collection?.isPublic ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const input = { title, description, isPublic };
          if (collection) {
            const result = await updateCollection(collection.id, input);
            if (!result.ok) return setError(result.error);
            router.refresh();
          } else {
            const result = await createCollection(input);
            if (!result.ok) return setError(result.error);
            router.push(`/c/${result.data.id}`);
          }
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required placeholder="예) 2025 여름 서코" className={field} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span>
          설명 <span className="text-xs text-quiet">(선택)</span>
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          rows={2}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!isPublic} onChange={(e) => setIsPublic(!e.target.checked)} className="size-5 accent-[var(--accent)]" />
        나만 보기 <span className="text-xs text-quiet">(끄면 내 프로필의 컬렉션에 보여요)</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending || !title.trim()} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
          {pending ? "저장하는 중…" : collection ? "저장" : "만들기"}
        </button>
        {collection && (
          <button
            type="button"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmAction({ title: "이 컬렉션을 지울까요?", body: "담긴 게시물은 그대로 남아요.", confirmLabel: "지우기", danger: true }))) return;
              startTransition(async () => {
                const result = await deleteCollection(collection.id);
                if (!result.ok) return setError(result.error);
                router.push("/me/collections");
              });
            }}
            className="min-h-11 rounded-xl border border-line px-5 text-sm text-quiet hover:text-text"
          >
            컬렉션 지우기
          </button>
        )}
      </div>
    </form>
  );
}

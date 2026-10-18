"use client";

import { useState, useTransition } from "react";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/post-input";
import { setInterests } from "./preferences";

type Category = (typeof CATEGORIES)[number];

/** 관심 분야 고르기 (S-01 ⑤): 누르는 즉시 저장, 실패하면 되돌린다. 홈 '추천' 순서에 반영된다. */
export function InterestPicker({ initial }: { initial: Category[] }) {
  const [picked, setPicked] = useState<Category[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-2" aria-label="관심 분야">
        {CATEGORIES.map((c) => {
          const on = picked.includes(c);
          return (
            <li key={c}>
              <button
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={() => {
                  const before = picked;
                  const next = on ? picked.filter((x) => x !== c) : [...picked, c];
                  setPicked(next);
                  setError(null);
                  startTransition(async () => {
                    const result = await setInterests(next);
                    if (!result.ok) {
                      setPicked(before);
                      setError(result.error);
                    }
                  });
                }}
                className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm aria-pressed:border-text aria-pressed:bg-text aria-pressed:font-semibold aria-pressed:text-bg"
              >
                {CATEGORY_LABEL[c]}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

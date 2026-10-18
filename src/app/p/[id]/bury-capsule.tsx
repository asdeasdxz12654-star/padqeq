"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { buryTimeCapsule } from "@/lib/capsules/actions";
import { CAPSULE_YEARS, type CapsuleYears } from "@/lib/capsules/open-on";

/** 타임캡슐 묻기 (내 글 · 내가 크레딧된 글): 미래의 나에게 편지. 여는 날 아침 알림이 오고, 그 전에는 나도 못 읽는다. */
export function BuryCapsule({ postId }: { postId: string }) {
  const [letter, setLetter] = useState("");
  const [years, setYears] = useState<CapsuleYears>(1);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done)
    return (
      <p className="text-sm">
        묻었어요. {done.replaceAll("-", ". ")}에 열려요.{" "}
        <Link href="/memories#capsules" className="underline underline-offset-2">
          내 타임캡슐
        </Link>
      </p>
    );

  return (
    <details className="w-full rounded-xl border border-line p-3 text-sm">
      <summary className="cursor-pointer">타임캡슐 묻기</summary>
      <form
        className="mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await buryTimeCapsule({ postId, letter, years });
            if (result.ok) setDone(result.openOn);
            else setError(result.error);
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-quiet">
          미래의 나에게 (여는 날까지는 나도 못 읽어요)
          <textarea
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            maxLength={1000}
            rows={4}
            required
            placeholder="이날 무슨 일이 있었는지, 지금 무슨 생각을 하는지…"
            className="rounded-xl border border-line bg-bg px-3 py-2 text-base text-text"
          />
        </label>
        <fieldset className="flex flex-wrap items-center gap-1.5">
          <legend className="mb-1 text-xs text-quiet">언제 열까요</legend>
          {CAPSULE_YEARS.map((y) => (
            <label
              key={y}
              className="inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line px-3 has-[:checked]:border-text has-[:checked]:bg-text has-[:checked]:text-bg"
            >
              <input type="radio" name="capsule-years" className="sr-only" checked={years === y} onChange={() => setYears(y)} />
              {y}년 뒤
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="text-xs text-accent">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending || !letter.trim()} className="min-h-10 self-start rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50">
          {pending ? "묻는 중…" : "묻기"}
        </button>
      </form>
    </details>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitAppeal } from "./actions";

export function AppealForm({ postId, remaining }: { postId: string; remaining: number }) {
  const router = useRouter();
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const length = statement.trim().length;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await submitAppeal({ postId, statement });
          if (!result.ok) {
            setError(result.error ?? "보내지 못했어요.");
            return;
          }
          setStatement("");
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-amber-100/90">
          소명 내용 <span className="text-xs">(10~2000자 · 남은 기회 {remaining}번)</span>
        </span>
        <textarea
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="예) 촬영 전에 모델분께 게시 동의를 받았어요. 동의 날짜와 방법은 ..."
          className="rounded-xl border border-line bg-bg px-3 py-2 text-base text-text"
        />
      </label>
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || length < 10}
        className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "보내는 중…" : "소명 보내기"}
      </button>
    </form>
  );
}

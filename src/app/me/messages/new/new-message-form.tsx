"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startThread } from "../actions";

export function NewMessageForm({ recipient }: { recipient: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await startThread({ recipient, body });
          if (!result.ok) return setError(result.error);
          router.push(`/me/messages/${result.threadId}`);
        });
      }}
    >
      <label className="sr-only" htmlFor="new-message">
        메시지
      </label>
      <textarea id="new-message" value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={5} required className="rounded-xl border border-line bg-bg px-3 py-2 text-base" />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button type="submit" disabled={!body.trim() || pending} className="min-h-11 self-start rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50">
        {pending ? "보내는 중…" : "보내기"}
      </button>
    </form>
  );
}

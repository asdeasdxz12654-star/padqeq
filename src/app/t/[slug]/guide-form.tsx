"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { GUIDE_FIELDS, type PlaceGuide } from "@/lib/places/guide";
import { savePlaceGuide } from "./actions";

/** 촬영지 가이드 고치기 (운영자). 모두 비우고 저장하면 가이드를 내린다. */
export function GuideForm({ tagId, initial }: { tagId: string; initial: PlaceGuide }) {
  const router = useRouter();
  const [guide, setGuide] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="mt-3 grid gap-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await savePlaceGuide({ tagId, guide });
          if (!result.ok) return setMessage({ ok: false, text: result.error });
          setMessage({ ok: true, text: "저장했어요." });
          router.refresh();
        });
      }}
    >
      {GUIDE_FIELDS.map((f) => (
        <label key={f.key} className={`flex flex-col gap-1 text-xs text-quiet ${f.key === "tip" ? "sm:col-span-2" : ""}`}>
          {f.label}
          <input
            value={guide[f.key]}
            onChange={(e) => setGuide((g) => ({ ...g, [f.key]: e.target.value }))}
            maxLength={f.max}
            placeholder={f.placeholder}
            className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base text-text"
          />
        </label>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50">
          {pending ? "저장 중…" : "가이드 저장"}
        </button>
        {message && (
          <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}

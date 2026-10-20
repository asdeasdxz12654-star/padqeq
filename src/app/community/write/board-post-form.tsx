"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type BoardKind, CASTING_KIND_LABEL, type CastingKind, type CastingTerms, SAFETY_GUIDE, TERMS_LABEL } from "@/lib/boards/labels";
import { REGIONS, type Region } from "@/lib/events/calendar";
import { Constants } from "@/lib/supabase/database.types";
import { saveBoardPost } from "../actions";

export type BoardDraft = {
  board: BoardKind;
  title: string;
  body: string;
  region: Region | null;
  castingKind: CastingKind | null;
  castingTerms: CastingTerms | null;
  shootOn: string | null;
};

const input = "min-h-11 rounded-xl border border-line bg-bg px-3 text-base";

/** 게시판 글 (게시판은 작성 목록에서 고르고 들어온다). 구인 · 섭외 칸은 예전 섭외 글을 고칠 때만 보인다. */
export function BoardPostForm({ id, initial }: { id: string | null; initial: BoardDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [guideRead, setGuideRead] = useState(id !== null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof BoardDraft>(key: K, value: BoardDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const casting = draft.board === "casting";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await saveBoardPost(id, draft);
          if (!result.ok) return setError(result.error);
          router.push(`/community/${result.id}`);
          router.refresh();
        });
      }}
    >
      {casting && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            분류
            <select value={draft.castingKind ?? ""} onChange={(e) => set("castingKind", (e.target.value || null) as CastingKind | null)} required className={input}>
              <option value="">고르세요</option>
              {Constants.public.Enums.casting_kind.map((k) => (
                <option key={k} value={k}>
                  {CASTING_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            조건
            <select value={draft.castingTerms ?? ""} onChange={(e) => set("castingTerms", (e.target.value || null) as CastingTerms | null)} required className={input}>
              <option value="">고르세요</option>
              {Constants.public.Enums.casting_terms.map((t) => (
                <option key={t} value={t}>
                  {TERMS_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {(casting || draft.board === "places") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            지역
            <select
              value={draft.region ?? ""}
              onChange={(e) => set("region", (e.target.value || null) as Region | null)}
              required
              className={input}
            >
              <option value="">고르세요</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {casting && (
            <label className="flex flex-col gap-1.5 text-sm">
              촬영 날짜 <span className="text-xs text-quiet">(선택)</span>
              <input type="date" value={draft.shootOn ?? ""} onChange={(e) => set("shootOn", e.target.value || null)} className={input} />
            </label>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        제목
        <input value={draft.title} onChange={(e) => set("title", e.target.value)} maxLength={80} required className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        내용
        <textarea
          value={draft.body}
          onChange={(e) => set("body", e.target.value)}
          maxLength={5000}
          rows={10}
          required
          placeholder={casting ? "콘셉트 · 의상 · 소요 시간 · 결과물 제공 방식을 적어 주세요." : undefined}
          className={`${input} py-2`}
        />
      </label>

      {casting && id === null && (
        <div className="rounded-xl border border-warn-line bg-warn-soft p-4 text-sm text-warn">
          <p className="font-semibold">첫 촬영 안전 가이드</p>
          <ul className="mt-2 list-disc pl-5 text-xs leading-relaxed">
            {SAFETY_GUIDE.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2">
            <input type="checkbox" checked={guideRead} onChange={(e) => setGuideRead(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            읽고 확인했어요
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || (casting && !guideRead)}
        className="min-h-11 self-start rounded-xl bg-accent px-6 font-semibold text-on-accent disabled:opacity-50"
      >
        {pending ? "저장 중…" : id ? "수정" : "올리기"}
      </button>
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { type CreditDraft, CreditEditor, toCreditInput } from "@/app/upload/credit-editor";
import type { TagOption } from "@/app/upload/tag-actions";
import { TagPicker } from "@/app/upload/tag-picker";
import { ProtectedPhoto } from "@/components/protected-photo";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/photos/post-input";
import type { PhotoSources } from "@/lib/photos/server";
import { currentYearKst, MIN_YEAR } from "@/lib/year-chips";
import { updatePost } from "./actions";

type Initial = {
  postId: string;
  title: string;
  body: string;
  category: (typeof CATEGORIES)[number];
  shotYear: number;
  shotOn: string | null;
  tags: TagOption[];
  photos: { id: string; altText: string; width: number; height: number; sources: PhotoSources | null }[];
  /** 기존 크레딧은 key가 "id:<크레딧 id>" */
  credits: CreditDraft[];
};

const field = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";

export function EditForm({ initial, isAdmin, viewerHandle }: { initial: Initial; isAdmin: boolean; viewerHandle: string | null }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [category, setCategory] = useState(initial.category);
  const [shotYear, setShotYear] = useState(initial.shotYear);
  const [shotOn, setShotOn] = useState(initial.shotOn ?? "");
  const [tags, setTags] = useState(initial.tags);
  const [credits, setCredits] = useState(initial.credits);
  const [alts, setAlts] = useState<Record<string, string>>(() => Object.fromEntries(initial.photos.map((p) => [p.id, p.altText])));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const thisYear = currentYearKst();
  const years = Array.from({ length: thisYear - MIN_YEAR + 1 }, (_, i) => thisYear - i);
  const back = `/p/${initial.postId}`;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await updatePost({
            postId: initial.postId,
            title,
            body,
            category,
            shotYear,
            shotOn: shotOn || null,
            tagIds: tags.map((t) => t.id),
            alts: initial.photos.map((p) => ({ photoId: p.id, altText: alts[p.id] ?? "" })),
            credits: {
              keep: credits.flatMap((c) => (c.key.startsWith("id:") ? [c.key.slice(3)] : [])),
              add: credits.filter((c) => !c.key.startsWith("id:")).map(toCreditInput),
            },
          });
          if (!result.ok) {
            setError(result.error ?? "저장하지 못했어요.");
            return;
          }
          router.push(back);
          router.refresh();
        });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required className={field} />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span>
          설명 <span className="text-xs text-quiet">(선택 · 2000자까지)</span>
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={4}
          className="rounded-xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5 text-sm">
        <legend className="mb-1.5">분야</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-full border border-line px-4 has-checked:border-accent has-checked:font-semibold has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input type="radio" name="category" checked={category === c} onChange={() => setCategory(c)} className="sr-only" />
              {CATEGORY_LABEL[c]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          촬영 연도
          <select
            value={shotYear}
            onChange={(e) => {
              const y = Number(e.target.value);
              setShotYear(y);
              // 날짜가 다른 해면 지운다 (연도와 날짜가 어긋나지 않게)
              if (shotOn && Number(shotOn.slice(0, 4)) !== y) setShotOn("");
            }}
            className={field}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span>
            촬영 날짜 <span className="text-xs text-quiet">(선택)</span>
          </span>
          <input
            type="date"
            value={shotOn}
            min={`${shotYear}-01-01`}
            max={`${shotYear}-12-31`}
            onChange={(e) => setShotOn(e.target.value)}
            className={field}
          />
        </label>
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <span>태그</span>
        <TagPicker value={tags} onChange={setTags} disabled={pending} isAdmin={isAdmin} />
      </div>

      <div className="flex flex-col gap-1.5 text-sm">
        <span>
          크레딧 <span className="text-xs text-quiet">(새로 태그한 회원에게는 승인 요청 알림이 가요)</span>
        </span>
        <CreditEditor value={credits} onChange={setCredits} disabled={pending} viewerHandle={viewerHandle} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm">
          사진 설명 <span className="text-xs text-quiet">(화면 낭독기로 사진을 듣는 분들께 읽어 줘요)</span>
        </legend>
        {initial.photos.map((p, i) => (
          <div key={p.id} className="flex items-start gap-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-lg bg-slot [&_picture]:h-full">
              {p.sources && (
                <ProtectedPhoto sources={p.sources} alt="" width={p.width} height={p.height} sizes="64px" className="block size-full object-cover" />
              )}
            </div>
            <label className="flex flex-1 flex-col gap-1 text-xs text-quiet">
              {i + 1}번째 사진
              <input
                value={alts[p.id] ?? ""}
                onChange={(e) => setAlts((a) => ({ ...a, [p.id]: e.target.value }))}
                maxLength={300}
                placeholder="예) 벚꽃이 핀 강변을 걷는 사람"
                className={`${field} text-text`}
              />
            </label>
          </div>
        ))}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !title.trim()}
          className="min-h-11 flex-1 rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "저장하는 중…" : "저장"}
        </button>
        <button type="button" onClick={() => router.push(back)} className="min-h-11 rounded-xl border border-line px-5">
          취소
        </button>
      </div>
    </form>
  );
}

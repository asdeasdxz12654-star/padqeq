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
import { COMMENT_POLICIES, COMMENT_POLICY_LABEL, type CommentPolicy, VISIBILITIES, VISIBILITY_LABEL, type Visibility, toKstLocal } from "@/lib/posts/audience";
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
  visibility: Visibility;
  commentPolicy: CommentPolicy;
  /** 예약 중이면 예약 시각, 아니면 null */
  scheduledAt: string | null;
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
  const [visibility, setVisibility] = useState(initial.visibility);
  const [commentPolicy, setCommentPolicy] = useState(initial.commentPolicy);
  const [scheduledAt, setScheduledAt] = useState(toKstLocal(initial.scheduledAt));
  const [alts, setAlts] = useState<Record<string, string>>(() => Object.fromEntries(initial.photos.map((p) => [p.id, p.altText])));
  // 남길 사진 (보여 줄 순서대로)
  const [order, setOrder] = useState(() => initial.photos.map((p) => p.id));
  const photoById = new Map(initial.photos.map((p) => [p.id, p]));
  const removed = initial.photos.filter((p) => !order.includes(p.id));
  const move = (index: number, delta: number) =>
    setOrder((o) => {
      const next = [...o];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });
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
            alts: order.map((id) => ({ photoId: id, altText: alts[id] ?? "" })),
            photoOrder: order,
            credits: {
              keep: credits.flatMap((c) => (c.key.startsWith("id:") ? [c.key.slice(3)] : [])),
              add: credits.filter((c) => !c.key.startsWith("id:")).map(toCreditInput),
            },
            visibility,
            commentPolicy,
            ...(initial.scheduledAt && { scheduledAt: scheduledAt || null }),
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

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-1.5 text-sm">공개 설정</legend>
        <label className="flex flex-col gap-1.5 text-sm">
          공개 범위
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)} disabled={pending} className={field}>
            {VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {VISIBILITY_LABEL[v].title}
              </option>
            ))}
          </select>
          <span className="text-xs text-quiet">{VISIBILITY_LABEL[visibility].help}</span>
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          댓글
          <select value={commentPolicy} onChange={(e) => setCommentPolicy(e.target.value as CommentPolicy)} disabled={pending} className={field}>
            {COMMENT_POLICIES.map((c) => (
              <option key={c} value={c}>
                {COMMENT_POLICY_LABEL[c]}
              </option>
            ))}
          </select>
          <span className="text-xs text-quiet">이미 달린 댓글은 그대로 보여요.</span>
        </label>
        {initial.scheduledAt && (
          <label className="flex flex-col gap-1.5 text-sm">
            예약 시각 <span className="text-xs text-quiet">(비우면 바로 공개)</span>
            <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} disabled={pending} className={field} />
          </label>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm">
          사진 <span className="text-xs text-quiet">(순서 · 빼기 · 설명. 설명은 화면 낭독기로 사진을 듣는 분들께 읽어 줘요)</span>
        </legend>
        {order.map((id, i) => {
          const p = photoById.get(id)!;
          return (
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
            <div className="flex shrink-0 flex-col gap-1 pt-4">
              <div className="flex gap-1">
                <button type="button" disabled={pending || i === 0} onClick={() => move(i, -1)} aria-label={`${i + 1}번째 사진을 앞으로`} className="size-9 rounded-lg border border-line disabled:opacity-30">
                  ↑
                </button>
                <button type="button" disabled={pending || i === order.length - 1} onClick={() => move(i, 1)} aria-label={`${i + 1}번째 사진을 뒤로`} className="size-9 rounded-lg border border-line disabled:opacity-30">
                  ↓
                </button>
              </div>
              <button type="button" disabled={pending || order.length === 1} onClick={() => setOrder((o) => o.filter((x) => x !== id))} className="min-h-9 rounded-lg border border-line px-2 text-xs text-quiet hover:text-text disabled:opacity-30">
                빼기
              </button>
            </div>
          </div>
          );
        })}
        {removed.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-dashed border-line p-3 text-xs text-quiet">
            <p>저장하면 뺀 사진 {removed.length}장이 게시물에서 지워져요. 되돌리려면 다시 넣기를 누르세요.</p>
            <ul className="flex flex-wrap gap-2">
              {removed.map((p) => (
                <li key={p.id}>
                  <button type="button" disabled={pending} onClick={() => setOrder((o) => [...o, p.id])} className="min-h-9 rounded-lg border border-line px-3 text-text">
                    {initial.photos.indexOf(p) + 1}번 사진 다시 넣기
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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

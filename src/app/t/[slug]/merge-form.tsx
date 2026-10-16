"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { mergeTags } from "./actions";

export type MergeCandidate = { id: string; name: string; slug: string };

/** 중복 태그 합치기 (최고 관리자). 이 태그의 게시물 · 팔로우 · 별칭을 고른 태그로 옮기고 이 태그는 없앤다. */
export function MergeForm({
  tagId,
  tagName,
  candidates,
  initialTargetId = "",
}: {
  tagId: string;
  tagName: string;
  candidates: MergeCandidate[];
  /** 태그 관리 › 비슷한 이름에서 넘어오면 남길 태그를 미리 골라 둔다 */
  initialTargetId?: string;
}) {
  const router = useRouter();
  const [targetId, setTargetId] = useState(candidates.some((c) => c.id === initialTargetId) ? initialTargetId : "");
  const [note, setNote] = useState("");
  const [sure, setSure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const target = candidates.find((c) => c.id === targetId);
  const field = "min-h-11 min-w-0 rounded-xl border border-line bg-bg px-3 text-base";

  if (candidates.length === 0) return <p className="mt-3 text-quiet">합칠 수 있는 같은 종류의 공식 태그가 없어요.</p>;

  return (
    <form
      className="mt-3 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await mergeTags({ sourceId: tagId, targetId, note });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.replace(`/t/${encodeURIComponent(result.slug)}`);
        });
      }}
    >
      <p className="text-quiet">
        같은 대상을 가리키는 태그를 하나로 합쳐요. 이 태그의 게시물 · 팔로우 · 별칭 · 지도 위치가 남길 태그로 옮겨 가고, 이 태그 이름은 남길 태그의 다른 표기가 돼요. 이 태그 주소로
        들어오면 남길 태그로 넘어가요.
      </p>
      <label className="flex flex-col gap-1.5">
        남길 태그
        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={field}>
          <option value="">고르기</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        이유 <span className="text-xs text-quiet">(감사 로그에 남아요)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="예: 같은 장소, 주소로 따로 생김" className={field} />
      </label>
      <label className="flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="size-5 shrink-0" />
        <span>
          {target ? `‘${tagName}’ 태그를 ‘${target.name}’(으)로 합치고 없애요.` : "이 태그를 없애요."} 되돌릴 수 없어요.
        </span>
      </label>
      <button
        type="submit"
        disabled={pending || !target || !note.trim() || !sure}
        className="min-h-11 self-start rounded-xl bg-red-500 px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? "합치는 중…" : "합치기"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}

"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { MAX_TAGS_PER_POST, TAG_KIND_LABEL, TAG_KINDS, type TagKind } from "@/lib/tags/tag-rules";
import { createTag, findSimilarExistingTags, searchTags, type SimilarTagOption, type TagOption } from "./tag-actions";

// 업로드 화면 태그 고르기: 검색해서 붙이고, 없으면 그 자리에서 만든다.

const inputClass = "min-h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent";

export function TagPicker({
  value,
  onChange,
  disabled,
  isAdmin,
}: {
  value: TagOption[];
  onChange(tags: TagOption[]): void;
  disabled: boolean;
  isAdmin: boolean;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; tags: TagOption[] } | null>(null);
  const [creating, setCreating] = useState(false);
  const full = value.length >= MAX_TAGS_PER_POST;

  // 입력이 멈추고 0.25초 뒤 검색
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const tags = await searchTags(q);
      if (!stale) setResults({ query: q, tags });
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [query]);

  const shown = results && results.query === query.trim() ? results.tags.filter((t) => !value.some((v) => v.id === t.id)) : [];
  const exact = results?.tags.some((t) => t.name.toLowerCase() === query.trim().toLowerCase());

  const add = (tag: TagOption) => {
    if (!value.some((v) => v.id === tag.id) && !full) onChange([...value, tag]);
    setQuery("");
    setResults(null);
    setCreating(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        태그 <span className="text-xs font-normal text-quiet">(작품 · 캐릭터 · 행사 · 장소, {MAX_TAGS_PER_POST}개까지)</span>
      </span>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag.id} className="flex items-center gap-1 rounded-full border border-line py-1 pr-1 pl-3 text-sm">
              <span className="text-xs text-quiet">{TAG_KIND_LABEL[tag.kind]}</span>
              {tag.parentName && <span className="text-quiet">{tag.parentName} ›</span>}
              {tag.name}
              {tag.pending && <span className="text-xs text-quiet">(승인 대기)</span>}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`${tag.name} 태그 빼기`}
                  onClick={() => onChange(value.filter((v) => v.id !== tag.id))}
                  className="flex size-6 items-center justify-center rounded-full hover:bg-slot"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && !full && (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCreating(false);
            }}
            placeholder="예: 원신, 라이덴 쇼군, Raiden"
            aria-autocomplete="list"
            aria-controls={listId}
            className={`${inputClass} w-full`}
          />
          {query.trim() && !creating && (
            <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl border border-line bg-surface p-1 shadow-lg">
              {shown.map((tag) => (
                <li key={tag.id} role="option" aria-selected={false}>
                  <button type="button" onClick={() => add(tag)} className="flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slot">
                    <span className="text-xs text-quiet">{TAG_KIND_LABEL[tag.kind]}</span>
                    {tag.parentName && <span className="text-quiet">{tag.parentName} ›</span>}
                    {tag.name}
                    {tag.pending && <span className="text-xs text-quiet">(승인 대기)</span>}
                  </button>
                </li>
              ))}
              {!exact && (
                <li>
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-accent hover:bg-slot"
                  >
                    새 태그 만들기: “{query.trim()}”
                  </button>
                </li>
              )}
            </ul>
          )}
          {creating && <NewTagForm name={query.trim()} isAdmin={isAdmin} onCreated={add} onCancel={() => setCreating(false)} />}
        </div>
      )}
    </div>
  );
}

function NewTagForm({
  name,
  isAdmin,
  onCreated,
  onCancel,
}: {
  name: string;
  isAdmin: boolean;
  onCreated(tag: TagOption): void;
  onCancel(): void;
}) {
  const [kind, setKind] = useState<TagKind>("work");
  const [parent, setParent] = useState<TagOption | null>(null);
  const [parentQuery, setParentQuery] = useState("");
  const [works, setWorks] = useState<TagOption[]>([]);
  const [aliases, setAliases] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // 같은 대상일 것 같은 기존 태그 (중복 태그를 처음부터 줄인다)
  const [similar, setSimilar] = useState<{ name: string; tags: SimilarTagOption[] } | null>(null);

  useEffect(() => {
    let stale = false;
    // 안내일 뿐이라 실패해도 조용히 넘어간다 (새 태그 만들기는 그대로 된다)
    findSimilarExistingTags(name).then(
      (tags) => {
        if (!stale) setSimilar({ name, tags });
      },
      () => {},
    );
    return () => {
      stale = true;
    };
  }, [name]);
  const similarTags = similar?.name === name ? similar.tags : [];

  useEffect(() => {
    if (kind !== "character" || !parentQuery.trim()) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const found = await searchTags(parentQuery);
      if (!stale) setWorks(found.filter((t) => t.kind === "work"));
    }, 250);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [kind, parentQuery]);

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-xl border border-line p-3">
      <p className="text-sm">
        새 태그 <strong>{name}</strong>
        {!isAdmin && <span className="block text-xs text-quiet">운영자가 승인하기 전까지는 내 게시물에만 보여요.</span>}
      </p>
      {similarTags.length > 0 && (
        <div role="status" className="flex flex-col gap-2 rounded-lg bg-slot p-3">
          <p className="text-sm">
            비슷한 태그가 이미 있어요. 같은 대상이면 새로 만들지 말고 이걸 붙여 주세요.
            <span className="block text-xs text-quiet">같은 장소 · 작품이 여러 태그로 나뉘면 사진이 흩어져요.</span>
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {similarTags.map((tag) => (
              <li key={tag.id}>
                <button
                  type="button"
                  onClick={() => onCreated(tag)}
                  className="flex min-h-9 items-baseline gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-left text-sm hover:border-accent"
                >
                  <span className="text-xs text-quiet">{TAG_KIND_LABEL[tag.kind]}</span>
                  {tag.parentName && <span className="text-quiet">{tag.parentName} ›</span>}
                  {tag.name}
                  {tag.pending && <span className="text-xs text-quiet">(승인 대기)</span>}
                  <span className="text-xs text-accent">붙이기</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {TAG_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => {
              setKind(k);
              setParent(null);
            }}
            className="rounded-full border border-line px-3 py-1 text-xs aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
          >
            {TAG_KIND_LABEL[k]}
          </button>
        ))}
      </div>

      {kind === "character" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-quiet">어느 작품의 캐릭터인가요?</span>
          {parent ? (
            <p className="text-sm">
              {parent.name}{" "}
              <button type="button" onClick={() => setParent(null)} className="text-xs text-quiet underline">
                바꾸기
              </button>
            </p>
          ) : (
            <>
              <input value={parentQuery} onChange={(e) => setParentQuery(e.target.value)} placeholder="작품 이름" className={inputClass} />
              <ul className="flex flex-wrap gap-1.5">
                {works.map((w) => (
                  <li key={w.id}>
                    <button type="button" onClick={() => setParent(w)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent">
                      {w.name}
                    </button>
                  </li>
                ))}
              </ul>
              {parentQuery.trim() && works.length === 0 && (
                <p className="text-xs text-quiet">작품 태그가 없으면 먼저 작품 태그를 만들어 주세요.</p>
              )}
            </>
          )}
        </div>
      )}

      <label className="flex flex-col gap-1 text-xs text-quiet">
        다른 표기 (쉼표로 구분, 선택)
        <input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="예: Raiden Shogun, 雷電将軍" className={inputClass} />
      </label>

      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending || (kind === "character" && !parent)}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await createTag({ kind, name, parentId: parent?.id ?? null, aliases });
              if (result.ok) onCreated(result.tag);
              else setError(result.error);
            })
          }
          className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {pending ? "만드는 중…" : "만들고 붙이기"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3 py-1.5 text-sm">
          취소
        </button>
      </div>
    </div>
  );
}

"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { type Suggestions, suggestSearch } from "@/app/explore/suggest-actions";
import { formatRange } from "@/lib/events/calendar";
import { MAX_QUERY_LENGTH } from "@/lib/posts/feed-params";
import { profileHref } from "@/lib/profiles/profile-href";
import { addRecent, readRecent, removeRecent, writeRecent } from "@/lib/search/recent";
import { TAG_KIND_LABEL } from "@/lib/tags/tag-rules";

// 검색창 (S-03 ① · S-04 ①): 입력하면 작품 · 캐릭터 · 크리에이터 · 행사를 추천하고, 비어 있으면 최근 검색어(이 기기에만)를 보여 준다.
// 자바스크립트가 없어도 그냥 폼으로 /explore?q= 에 간다.

type Option = { key: string; label: string; hint?: string; href: string; group: string; query?: string };

const pathFor = (q: string, keep: Record<string, string>) => `/explore?${new URLSearchParams({ ...keep, q })}`;

export function SearchBox({
  id,
  variant,
  initialQuery = "",
  keep = {},
  autoFocus = false,
}: {
  id: string;
  variant: "page" | "header";
  initialQuery?: string;
  /** 검색해도 남길 조건 (카테고리 · 연도 · 정렬) */
  keep?: Record<string, string>;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  const [found, setFound] = useState<{ q: string; s: Suggestions } | null>(null);
  const request = useRef(0);
  const q = value.trim();

  // 입력이 멈추면 추천을 받는다 (늦게 온 옛 답은 버린다)
  useEffect(() => {
    if (!open || !q) return;
    const n = ++request.current;
    const timer = setTimeout(() => {
      void suggestSearch(q)
        .then((s) => n === request.current && setFound({ q, s }))
        .catch(() => undefined);
    }, 200);
    return () => clearTimeout(timer);
  }, [q, open]);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  const s = found && found.q === q ? found.s : null;
  const options: Option[] = q
    ? [
        { key: "q", label: `‘${q}’ 검색`, href: pathFor(q, keep), group: "검색", query: q },
        ...(s?.tags ?? []).map((t) => ({
          key: `t:${t.slug}`,
          label: t.kind === "general" ? `#${t.name}` : t.name,
          hint: t.parentName ? `${t.parentName} › ${TAG_KIND_LABEL[t.kind]}` : TAG_KIND_LABEL[t.kind],
          href: `/t/${encodeURIComponent(t.slug)}`,
          group: "태그",
        })),
        ...(s?.creators ?? []).map((c) => ({ key: `c:${c.handle}`, label: `@${c.handle}`, hint: c.display_name, href: profileHref(c.handle), group: "크리에이터" })),
        ...(s?.events ?? []).map((e) => ({ key: `e:${e.id}`, label: e.name, hint: formatRange(e.starts_on, e.ends_on), href: `/events/${e.id}`, group: "행사" })),
      ]
    : recent.map((r) => ({ key: `r:${r}`, label: r, href: pathFor(r, keep), group: "최근 검색어", query: r }));
  const showList = open && options.length > 0;

  const go = (option: Option) => {
    if (option.query) {
      const next = addRecent(readRecent(), option.query);
      writeRecent(next);
      setRecent(next);
      setValue(option.query);
    }
    setOpen(false);
    setActive(-1);
    input.current?.blur();
    router.push(option.href);
  };

  return (
    <form
      action="/explore"
      role="search"
      className={`relative flex gap-2 ${variant === "header" ? "w-44 lg:w-64 xl:w-80" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (q) go({ key: "q", label: q, href: pathFor(q, keep), group: "검색", query: q });
      }}
    >
      {Object.entries(keep).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="sr-only" htmlFor={id}>
        검색어
      </label>
      <input
        ref={input}
        id={id}
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => {
          setRecent(readRecent());
          setOpen(true);
        }}
        // 목록을 누르는 동안은 닫지 않는다 (onMouseDown에서 막음)
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === "ArrowUp" && options.length) {
            e.preventDefault();
            setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
          } else if (e.key === "Enter" && showList && active >= 0) {
            e.preventDefault();
            go(options[active]!);
          } else if (e.key === "Escape" && open) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        maxLength={MAX_QUERY_LENGTH}
        placeholder={variant === "header" ? "검색 (/)" : "제목 · 태그 · @핸들"}
        enterKeyHint="search"
        autoComplete="off"
        className={`min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent ${variant === "header" ? "min-h-10 text-sm" : "min-h-11"}`}
      />
      {variant === "page" && (
        <button type="submit" className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">
          찾기
        </button>
      )}

      {showList && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg" onMouseDown={(e) => e.preventDefault()}>
          <ul id={listId} role="listbox" aria-label={q ? "추천" : "최근 검색어"} className="max-h-[60vh] overflow-y-auto py-1">
            {options.map((o, i) => (
              <li
                key={o.key}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onClick={() => go(o)}
                onMouseMove={() => setActive(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 px-3 text-sm ${i === active ? "bg-slot" : ""}`}
              >
                {(i === 0 || options[i - 1]!.group !== o.group) && o.group !== "검색" && (
                  <span className="w-16 shrink-0 text-[11px] text-quiet">{o.group}</span>
                )}
                {i > 0 && options[i - 1]!.group === o.group && o.group !== "검색" && <span className="w-16 shrink-0" />}
                <span className={`min-w-0 flex-1 truncate ${o.group === "검색" ? "font-semibold" : ""}`}>{o.label}</span>
                {o.hint && <span className="max-w-[40%] shrink-0 truncate text-xs text-quiet">{o.hint}</span>}
                {o.group === "최근 검색어" && (
                  <button
                    type="button"
                    aria-label={`${o.label} 지우기`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = removeRecent(recent, o.label);
                      writeRecent(next);
                      setRecent(next);
                    }}
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-quiet hover:bg-bg hover:text-text"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!q && recent.length > 0 && (
            <button
              type="button"
              onClick={() => {
                writeRecent([]);
                setRecent([]);
              }}
              className="w-full border-t border-line px-3 py-2.5 text-left text-xs text-quiet hover:text-text"
            >
              최근 검색어 모두 지우기 · 이 기기에만 저장돼요
            </button>
          )}
        </div>
      )}
    </form>
  );
}

/** 상단 바 검색 (넓은 화면, 탐색 화면에서는 큰 검색창이 있으므로 숨김) */
export function HeaderSearch() {
  const pathname = usePathname();
  if (pathname === "/explore") return null;
  return (
    <div className="hidden md:block">
      <SearchBox id="site-search" variant="header" />
    </div>
  );
}

/** '/' 키: 어디서든 검색창으로 (S-03 ①). 검색창이 안 보이면 탐색 화면을 연다. */
export function SearchShortcut() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select"))) return;
      if (document.querySelector("dialog[open], [data-overlay]")) return;
      e.preventDefault();
      const box = [document.getElementById("explore-q"), document.getElementById("site-search")].find(
        (el): el is HTMLInputElement => el instanceof HTMLInputElement && el.offsetParent !== null,
      );
      if (box) box.focus();
      else router.push("/explore?focus=1");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}

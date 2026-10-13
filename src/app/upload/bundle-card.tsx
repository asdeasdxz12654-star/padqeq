"use client";

import Link from "next/link";
import { CATEGORIES, CATEGORY_LABEL, type ConsentInput } from "@/lib/photos/post-input";
import { timeRange } from "@/lib/photos/grouping";
import { MIN_YEAR } from "@/lib/year-chips";
import type { Draft } from "./publish-bundle";
import type { Photo } from "./use-converter";

export type BundleState =
  | { kind: "edit" }
  | { kind: "uploading"; sent: number; total: number }
  | { kind: "publishing" }
  | { kind: "published"; postId: string }
  | { kind: "error"; message: string };

export type Bundle = {
  id: string;
  photoIds: string[];
  title: string;
  body: string;
  category: (typeof CATEGORIES)[number];
  hasPeople: boolean;
  /** 직접 고른 촬영 연도. null이면 사진 촬영일 → 올해 */
  shotYear: number | null;
  consent: ConsentInput;
  draft: Draft | null;
  state: BundleState;
};

export const emptyConsent = (): ConsentInput => ({
  subjectLabel: "",
  consentedOn: "",
  note: "",
  hasMinor: false,
  guardianConsent: false,
});

/** 게시할 수 없는 이유 (없으면 null) */
export function bundleProblem(bundle: Bundle, photos: Photo[], isAdmin: boolean): string | null {
  if (photos.length === 0) return "사진이 없어요";
  if (photos.some((p) => p.status === "error")) return "변환에 실패한 사진을 빼 주세요";
  if (photos.some((p) => p.status !== "ready")) return "사진 변환 중";
  if (!bundle.title.trim()) return "제목을 입력해 주세요";
  if (bundle.hasPeople) {
    if (!isAdmin) return "지금은 운영자만 사람이 나오는 사진을 게시할 수 있어요";
    const c = bundle.consent;
    if (!c.subjectLabel.trim() || !c.consentedOn) return "촬영 동의 기록을 입력해 주세요";
    if (c.hasMinor && !c.guardianConsent) return "미성년자가 있으면 보호자 동의가 필요해요";
  }
  return null;
}

/** 촬영 연도: 직접 고르지 않았으면 묶음의 가장 이른 촬영일 → 올해 */
export function effectiveYear(bundle: Bundle, photos: Photo[], currentYear: number): { year: number; exifYear: number | null } {
  const range = timeRange(photos);
  const exifYear = range ? new Date(range.start).getFullYear() : null;
  const valid = exifYear !== null && exifYear >= MIN_YEAR && exifYear <= currentYear ? exifYear : null;
  return { year: bundle.shotYear ?? valid ?? currentYear, exifYear: valid };
}

const inputClass = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";
const timeFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
const clockFormat = new Intl.DateTimeFormat("ko-KR", { timeStyle: "short" });

export function BundleCard({
  index,
  bundle,
  photos,
  isAdmin,
  currentYear,
  hasPrev,
  hasNext,
  onChange,
  onMovePhoto,
  onTransferPhoto,
  onRemovePhoto,
  onRemoveBundle,
  onMergeNext,
  onPublish,
}: {
  index: number;
  bundle: Bundle;
  photos: Photo[];
  isAdmin: boolean;
  currentYear: number;
  hasPrev: boolean;
  hasNext: boolean;
  onChange(patch: Partial<Bundle>): void;
  onMovePhoto(photoId: string, delta: -1 | 1): void;
  onTransferPhoto(photoId: string, direction: -1 | 1): void;
  onRemovePhoto(photoId: string): void;
  onRemoveBundle(): void;
  onMergeNext(): void;
  onPublish(): void;
}) {
  const { state } = bundle;
  const published = state.kind === "published";
  const working = state.kind === "uploading" || state.kind === "publishing";
  // 초안을 만든 뒤에는 사진 · 내용을 바꾸지 않는다 (서버에 적은 값과 맞아야 함)
  const locked = bundle.draft !== null || published || working;
  const problem = bundleProblem(bundle, photos, isAdmin);
  const range = timeRange(photos);
  const { year, exifYear } = effectiveYear(bundle, photos, currentYear);
  const set = (patch: Partial<Bundle>) => onChange(patch);

  if (published) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-line p-4">
        <span className="font-semibold">묶음 {index + 1}</span>
        <span className="truncate text-sm text-quiet">{bundle.title}</span>
        <span className="ml-auto text-sm text-emerald-400">게시됨</span>
        <Link href={`/p/${state.postId}`} className="text-sm text-accent underline underline-offset-4">
          보기
        </Link>
      </section>
    );
  }

  return (
    <section aria-label={`묶음 ${index + 1}`} className="flex flex-col gap-4 rounded-2xl border border-line p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold">
          묶음 {index + 1} · {photos.length}장
        </h2>
        {range && (
          <span className="text-xs text-quiet">
            {timeFormat.format(new Date(range.start))}
            {range.end !== range.start && `–${clockFormat.format(new Date(range.end))}`}
          </span>
        )}
        {!locked && (
          <div className="ml-auto flex gap-3 text-xs text-quiet">
            {hasNext && (
              <button type="button" onClick={onMergeNext} className="underline underline-offset-2">
                다음 묶음과 합치기
              </button>
            )}
            <button type="button" onClick={onRemoveBundle} className="underline underline-offset-2">
              묶음 빼기
            </button>
          </div>
        )}
      </header>

      <ol className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((photo, i) => (
          <li key={photo.id} className="flex flex-col gap-1">
            <div className="photo-guard relative aspect-square overflow-hidden rounded-lg bg-slot">
              {photo.preview && (
                // 내 브라우저에서 만든 미리보기(blob:)라 이미지 게이트를 거치지 않는다
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.preview} alt="" draggable={false} className="size-full object-cover" />
              )}
              {i === 0 && (
                <span className="absolute top-1 left-1 rounded-full bg-bg/80 px-1.5 py-0.5 text-[10px] font-semibold">
                  대표
                </span>
              )}
              {photo.status === "converting" && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-line">
                  <span className="block h-full bg-accent" style={{ width: `${Math.round(photo.progress * 100)}%` }} />
                </span>
              )}
              {photo.status === "error" && (
                <span className="absolute inset-0 flex items-center justify-center bg-bg/70 p-1 text-center text-[10px] text-red-300">
                  {photo.error}
                </span>
              )}
            </div>
            {!locked && (
              <div className="grid grid-cols-5 gap-0.5 text-[11px]">
                <IconButton label="앞으로" disabled={i === 0} onClick={() => onMovePhoto(photo.id, -1)}>
                  ←
                </IconButton>
                <IconButton label="뒤로" disabled={i === photos.length - 1} onClick={() => onMovePhoto(photo.id, 1)}>
                  →
                </IconButton>
                <IconButton
                  label={hasPrev ? "앞 묶음으로" : "새 묶음으로"}
                  onClick={() => onTransferPhoto(photo.id, -1)}
                  disabled={!hasPrev && photos.length === 1}
                >
                  ⇡
                </IconButton>
                <IconButton
                  label={hasNext ? "다음 묶음으로" : "새 묶음으로"}
                  onClick={() => onTransferPhoto(photo.id, 1)}
                  disabled={!hasNext && photos.length === 1}
                >
                  ⇣
                </IconButton>
                <IconButton label="빼기" onClick={() => onRemovePhoto(photo.id)}>
                  ×
                </IconButton>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          제목
          <input
            maxLength={80}
            value={bundle.title}
            disabled={locked}
            onChange={(e) => set({ title: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          촬영 연도
          <select
            value={year}
            disabled={locked}
            onChange={(e) => set({ shotYear: Number(e.target.value) })}
            className={inputClass}
          >
            {Array.from({ length: currentYear - MIN_YEAR + 1 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
                {y === exifYear ? " (사진 촬영일)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium md:col-span-2">
          설명 <span className="text-xs font-normal text-quiet">(선택)</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={bundle.body}
            disabled={locked}
            onChange={(e) => set({ body: e.target.value })}
            className={`${inputClass} py-2`}
          />
        </label>
      </div>

      <CategoryAndConsent
        category={bundle.category}
        hasPeople={bundle.hasPeople}
        consent={bundle.consent}
        disabled={locked}
        isAdmin={isAdmin}
        onChange={(patch) => set(patch)}
      />

      <footer className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={problem !== null || working || published}
          onClick={onPublish}
          className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {state.kind === "uploading"
            ? `올리는 중… ${state.sent} / ${state.total}`
            : state.kind === "publishing"
              ? "게시하는 중…"
              : bundle.draft
                ? "다시 시도"
                : "이 묶음 게시"}
        </button>
        {problem && !working && <span className="text-xs text-quiet">{problem}</span>}
        {state.kind === "error" && <span className="text-xs text-red-300">{state.message}</span>}
      </footer>
    </section>
  );
}

/** 카테고리 · 사람 여부 · 촬영 동의 기록 (묶음 카드 · 공통 설정에서 함께 씀) */
export function CategoryAndConsent({
  category,
  hasPeople,
  consent,
  disabled,
  isAdmin,
  onChange,
}: {
  category: Bundle["category"];
  hasPeople: boolean;
  consent: ConsentInput;
  disabled: boolean;
  isAdmin: boolean;
  onChange(patch: Partial<Pick<Bundle, "category" | "hasPeople" | "consent">>): void;
}) {
  const setConsent = (patch: Partial<ConsentInput>) => onChange({ consent: { ...consent, ...patch } });
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium">카테고리</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => onChange({ category: c, hasPeople: c !== "landscape" })}
              className="rounded-full border border-line px-3 py-1.5 text-sm aria-pressed:border-accent aria-pressed:bg-accent aria-pressed:text-on-accent"
            >
              {CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={hasPeople}
          onChange={(e) => onChange({ hasPeople: e.target.checked })}
          className="size-5 accent-[var(--accent)]"
        />
        사진에 사람이 나와요
      </label>

      {hasPeople && (
        <div className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-2">
          <p className="text-xs font-semibold md:col-span-2">
            촬영 동의 기록 <span className="font-normal text-quiet">(비공개 · 운영자만 열람)</span>
            {!isAdmin && <span className="block text-red-300">지금은 운영자만 사람이 나오는 사진을 게시할 수 있어요.</span>}
          </p>
          <label className="flex flex-col gap-1 text-sm">
            사진 속 인물
            <input
              maxLength={60}
              placeholder="예: 코스어 @moon_cos"
              value={consent.subjectLabel}
              onChange={(e) => setConsent({ subjectLabel: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            동의 받은 날
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={consent.consentedOn}
              onChange={(e) => setConsent({ consentedOn: e.target.value })}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            메모 <span className="text-xs text-quiet">(서면 · 메시지 · 구두 등 동의 방법)</span>
            <input
              maxLength={500}
              value={consent.note}
              onChange={(e) => setConsent({ note: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={consent.hasMinor}
              onChange={(e) => setConsent({ hasMinor: e.target.checked })}
              className="size-5 accent-[var(--accent)]"
            />
            미성년자가 있어요
          </label>
          {consent.hasMinor && (
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={consent.guardianConsent}
                onChange={(e) => setConsent({ guardianConsent: e.target.checked })}
                className="size-5 accent-[var(--accent)]"
              />
              보호자 동의를 받았어요 (필수)
            </label>
          )}
        </div>
      )}
    </fieldset>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="min-h-8 rounded-md border border-line disabled:opacity-30"
    >
      {children}
    </button>
  );
}

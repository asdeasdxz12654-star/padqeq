"use client";

import { rememberAudience } from "./audience-defaults";
import { COMMENT_POLICIES, COMMENT_POLICY_LABEL, type CommentPolicy, VISIBILITIES, VISIBILITY_LABEL, type Visibility } from "@/lib/posts/audience";
import Link from "next/link";
import { useState } from "react";
import { VeilSelect } from "@/components/veil-select";
import type { VeilReason } from "@/lib/posts/veil-reasons";
import { CATEGORIES, CATEGORY_LABEL, type ConsentInput } from "@/lib/photos/post-input";
import { timeRange } from "@/lib/photos/grouping";
import { autoTitle, peopleByDefault, veilOffered } from "@/lib/photos/write-defaults";
import { MIN_YEAR } from "@/lib/year-chips";
import type { Draft } from "./publish-bundle";
import { localDate } from "./publish-bundle";
import type { TagOption } from "./tag-actions";
import { TagPicker } from "./tag-picker";
import { type CreditDraft, CreditEditor } from "./credit-editor";
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
  /** 비우면 첫 태그 · 촬영일로 자동 (autoTitle) */
  title: string;
  body: string;
  category: (typeof CATEGORIES)[number];
  hasPeople: boolean;
  /** 직접 고른 촬영 연도. null이면 사진 촬영일 → 올해 */
  shotYear: number | null;
  consent: ConsentInput;
  tags: TagOption[];
  credits: CreditDraft[];
  visibility: Visibility;
  commentPolicy: CommentPolicy;
  showExif: boolean;
  /** 가림 표시 (보기 불편할 수 있는 사진) */
  veil: VeilReason | null;
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
export function bundleProblem(bundle: Bundle, photos: Photo[]): string | null {
  if (photos.length === 0) return "사진이 없어요";
  if (photos.some((p) => p.status === "error")) return "실패한 사진을 다시 시도하거나 빼 주세요";
  if (photos.some((p) => p.status === "converting")) return "사진 변환 중";
  if (photos.some((p) => p.status !== "ready")) return "사진 올리는 중";
  if (bundle.hasPeople) {
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

/** 게시할 제목: 적은 제목, 비었으면 첫 태그 · 촬영일 */
export function titleFor(bundle: Bundle, photos: Photo[]): string {
  const range = timeRange(photos);
  return bundle.title.trim() || autoTitle({ tagName: bundle.tags[0]?.name ?? null, category: bundle.category, shotOn: range ? localDate(range.start) : null });
}

const RAW_LABEL = {
  pending: "RAW 해석 중",
  preview: "RAW · 내장 미리보기",
  full: "RAW · 전체 현상",
  "preview-small": "RAW · 작은 미리보기",
} as const;

const inputClass = "min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";
const dayFormat = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });

/**
 * 게시물 하나 (글쓰기 › 사진 올리기, 캔버스 39–40).
 * PC는 왼쪽 사진 · 오른쪽 정보, 휴대폰은 위아래로. 처음 보이는 칸: 사진 · 촬영 연도 · 제목(선택) · 설명 · 태그 · 크레딧 · 사람이 나와요 · 고급 설정.
 */
export function BundleCard({
  bundle,
  photos,
  viewerHandle,
  currentYear,
  bundleCount,
  index,
  addInputId,
  footer,
  onChange,
  onMovePhoto,
  onTransferPhoto,
  onRemovePhoto,
  onRetryPhoto,
}: {
  bundle: Bundle;
  photos: Photo[];
  viewerHandle: string | null;
  currentYear: number;
  /** 게시물이 여럿이면 사진을 다른 게시물로 옮길 수 있다 */
  bundleCount: number;
  index: number;
  /** '사진 더 넣기' 칸이 여는 파일 고르기 입력 */
  addInputId: string;
  /** PC 오른쪽 칸 맨 아래에 붙는 게시 버튼 줄 */
  footer: React.ReactNode;
  onChange(patch: Partial<Bundle>): void;
  /** 사진을 이 자리로 옮기기 (0이면 대표) */
  onMovePhoto(photoId: string, toIndex: number): void;
  onTransferPhoto(photoId: string, direction: -1 | 1): void;
  onRemovePhoto(photoId: string): void;
  onRetryPhoto?(photoId: string): void;
}) {
  const { state } = bundle;
  const working = state.kind === "uploading" || state.kind === "publishing";
  // 초안을 만든 뒤에는 사진 · 내용을 바꾸지 않는다 (서버에 적은 값과 맞아야 함)
  const locked = bundle.draft !== null || state.kind === "published" || working;
  const range = timeRange(photos);
  const { year, exifYear } = effectiveYear(bundle, photos, currentYear);
  const [yearOpen, setYearOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const set = (patch: Partial<Bundle>) => onChange(patch);

  if (state.kind === "published") {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-line p-4">
        <span className="truncate text-sm">{titleFor(bundle, photos)}</span>
        <span className="ml-auto text-sm text-ok">게시됨</span>
        <Link href={`/p/${state.postId}`} className="text-sm text-accent underline underline-offset-4">
          보기
        </Link>
      </section>
    );
  }

  return (
    <section aria-label={bundleCount > 1 ? `게시물 ${index + 1}` : "게시물"} className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_400px] md:items-start md:gap-8">
      <div className="flex flex-col gap-2">
        <ol className="grid grid-cols-4 gap-1.5 md:gap-2.5">
          {photos.map((photo, i) => (
            <li
              key={photo.id}
              draggable={!locked}
              onDragStart={() => setDragging(photo.id)}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging && dragging !== photo.id) onMovePhoto(dragging, i);
                setDragging(null);
              }}
              className={`relative ${dragging === photo.id ? "opacity-40" : ""}`}
            >
              <button
                type="button"
                disabled={locked}
                onClick={() => setMenu(menu === photo.id ? null : photo.id)}
                aria-label={`${i + 1}번째 사진${i === 0 ? " (대표)" : ""} · 순서 바꾸기`}
                aria-expanded={menu === photo.id}
                className="photo-guard relative block aspect-square w-full overflow-hidden rounded-lg bg-slot"
              >
                {photo.preview && (
                  // 내 브라우저에서 만든 미리보기(blob:)라 이미지 게이트를 거치지 않는다
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.preview} alt="" draggable={false} className="size-full object-cover" />
                )}
                {i === 0 && <span className="absolute bottom-1 left-1 rounded-md bg-bg/85 px-1.5 text-[10px] font-bold">대표</span>}
                {photo.raw && (
                  <span className="absolute right-1 bottom-1 rounded-md bg-bg/85 px-1.5 text-[10px] font-semibold">{RAW_LABEL[photo.raw.method]}</span>
                )}
                {(photo.status === "converting" || photo.status === "uploading") && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-line" title={photo.status === "uploading" ? "올리는 중" : "변환 중"}>
                    <span
                      className={`block h-full ${photo.status === "uploading" ? "bg-emerald-400" : "bg-accent"}`}
                      style={{ width: `${Math.round(photo.progress * 100)}%` }}
                    />
                  </span>
                )}
              </button>
              {photo.similarPostId && (
                <a
                  href={`/p/${photo.similarPostId}`}
                  target="_blank"
                  rel="noopener"
                  title="이미 올린 사진과 비슷해요"
                  className="absolute inset-x-0 top-0 rounded-t-lg bg-amber-500/90 px-1 py-0.5 text-center text-[10px] font-semibold text-black"
                >
                  이미 올린 사진?
                </a>
              )}
              {!locked && (
                <button
                  type="button"
                  aria-label={`${i + 1}번째 사진 빼기`}
                  onClick={() => onRemovePhoto(photo.id)}
                  className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                >
                  ×
                </button>
              )}
              {photo.status === "error" && (
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg bg-bg/80 p-1 text-center text-[10px] text-danger">
                  {photo.error}
                  {photo.retryable && onRetryPhoto && (
                    <button type="button" onClick={() => onRetryPhoto(photo.id)} className="rounded-full border border-line px-2 py-0.5 text-text">
                      다시 시도
                    </button>
                  )}
                </span>
              )}
              {menu === photo.id && !locked && (
                <div role="menu" className="absolute top-full left-0 z-20 mt-1 flex w-40 flex-col rounded-xl border border-line bg-bg p-1 text-sm shadow-lg">
                  {[
                    i > 0 && { label: "대표로", run: () => onMovePhoto(photo.id, 0) },
                    i > 0 && { label: "앞으로", run: () => onMovePhoto(photo.id, i - 1) },
                    i < photos.length - 1 && { label: "뒤로", run: () => onMovePhoto(photo.id, i + 1) },
                    bundleCount > 1 && index > 0 && { label: "앞 게시물로", run: () => onTransferPhoto(photo.id, -1) },
                    bundleCount > 1 && index < bundleCount - 1 && { label: "다음 게시물로", run: () => onTransferPhoto(photo.id, 1) },
                  ]
                    .filter((x): x is { label: string; run: () => void } => Boolean(x))
                    .map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          item.run();
                          setMenu(null);
                        }}
                        className="min-h-10 rounded-lg px-3 text-left hover:bg-surface"
                      >
                        {item.label}
                      </button>
                    ))}
                </div>
              )}
            </li>
          ))}
          {!locked && (
            <li>
              <label
                htmlFor={addInputId}
                className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-line text-center text-xs text-quiet hover:border-accent"
              >
                <span aria-hidden="true" className="text-2xl leading-none">
                  +
                </span>
                <span className="hidden md:block">사진 더 넣기</span>
                <span className="sr-only md:hidden">사진 더 넣기</span>
              </label>
            </li>
          )}
        </ol>
        <p className="text-xs leading-relaxed text-quiet">
          사진을 누르면 순서를 바꿀 수 있어요<span className="hidden md:inline"> (끌어서 옮겨도 돼요)</span> · 첫 사진이 대표 · 원본 파일은 서버에 저장하지 않으니 따로 보관해 주세요.
        </p>
        {photos.some((p) => p.raw) && (
          <p className="rounded-xl bg-surface px-3 py-2 text-xs leading-relaxed text-quiet">
            RAW 사진은 보정하지 않은 원본 그대로 올라가요. 색 · 밝기가 카메라 JPEG나 보정본과 다를 수 있어요.
            {photos.some((p) => p.raw?.method === "preview-small") && " 휴대폰에서는 RAW 안의 작은 미리보기로 올라가니, 고화질은 PC에서 올려 주세요."}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-5 md:sticky md:top-20 md:rounded-2xl md:border md:border-line md:p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <strong>{year}년</strong>
          <span className="text-xs text-quiet">
            {bundle.shotYear !== null ? "직접 고름" : range && exifYear === year ? `사진 촬영일 · ${dayFormat.format(new Date(range.start))}` : "촬영일 정보 없음 · 올해"}
          </span>
          {!locked && (
            <button type="button" onClick={() => setYearOpen((v) => !v)} className="ml-auto min-h-9 text-sm font-semibold text-accent">
              바꾸기
            </button>
          )}
          {yearOpen && !locked && (
            <select
              aria-label="촬영 연도"
              value={year}
              onChange={(e) => {
                set({ shotYear: Number(e.target.value) });
                setYearOpen(false);
              }}
              className={inputClass}
            >
              {Array.from({ length: currentYear - MIN_YEAR + 1 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                  {y === exifYear ? " (사진 촬영일)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>
            제목 <span className="text-xs font-normal text-quiet">(선택)</span>
          </span>
          <input
            maxLength={80}
            value={bundle.title}
            disabled={locked}
            placeholder={`비우면 '${titleFor({ ...bundle, title: "" }, photos)}'`}
            onChange={(e) => set({ title: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>
            설명 <span className="text-xs font-normal text-quiet">(선택)</span>
          </span>
          <textarea rows={2} maxLength={2000} value={bundle.body} disabled={locked} onChange={(e) => set({ body: e.target.value })} className={`${inputClass} py-2`} />
        </label>

        <TagPicker value={bundle.tags} onChange={(tags) => set({ tags })} disabled={locked} />
        <CreditEditor value={bundle.credits} onChange={(credits) => set({ credits })} disabled={locked} viewerHandle={viewerHandle} collapsible />

        <PeopleAndConsent hasPeople={bundle.hasPeople} consent={bundle.consent} disabled={locked} onChange={set} />

        <AdvancedFields bundle={bundle} disabled={locked} onChange={set} />

        {state.kind === "error" && <p className="text-sm text-danger">{state.message}</p>}
        <div className="hidden md:block">{footer}</div>
      </div>
    </section>
  );
}

/** 사진에 사람이 나와요 · 촬영 동의 기록 (올리기 · 게시물 편집에서 함께 씀) */
export function PeopleAndConsent({
  hasPeople,
  consent,
  disabled,
  onChange,
  note,
}: {
  hasPeople: boolean;
  consent: ConsentInput;
  disabled: boolean;
  onChange(patch: { hasPeople?: boolean; consent?: ConsentInput }): void;
  /** 동의 기록 칸 위의 안내 (편집: 이미 남긴 기록이 있음 등) */
  note?: React.ReactNode;
}) {
  const [memoOpen, setMemoOpen] = useState(consent.note !== "");
  const setConsent = (patch: Partial<ConsentInput>) => onChange({ consent: { ...consent, ...patch } });
  return (
    <fieldset disabled={disabled} className="flex flex-col gap-3">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
        사진에 사람이 나와요
        <input type="checkbox" role="switch" checked={hasPeople} onChange={(e) => onChange({ hasPeople: e.target.checked })} className="peer sr-only" />
        <span
          aria-hidden="true"
          className="relative ml-auto h-6 w-11 shrink-0 rounded-full bg-line transition-colors peer-checked:bg-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
        />
      </label>
      {!hasPeople && <p className="-mt-2 text-xs text-quiet">사람이 나오면 켜 주세요. 켜면 촬영 동의 기록을 적어요.</p>}
      {hasPeople && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <p className="text-xs font-semibold">
            촬영 동의 기록 <span className="font-normal text-quiet">· 비공개 · 운영자만 열람</span>
            <span className="block font-normal text-quiet">사진에 나온 분께 공개 게시 동의를 받았다는 기록이에요. 초상권 신고가 들어오면 운영자가 확인해요.</span>
          </p>
          {note}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="flex flex-col gap-1 text-sm">
              사진 속 인물
              <input maxLength={60} placeholder="예: 코스어 @moon_cos" value={consent.subjectLabel} onChange={(e) => setConsent({ subjectLabel: e.target.value })} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              동의 받은 날
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={consent.consentedOn}
                onChange={(e) => setConsent({ consentedOn: e.target.value })}
                className={inputClass}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="flex min-h-10 items-center gap-2">
              <input type="checkbox" checked={consent.hasMinor} onChange={(e) => setConsent({ hasMinor: e.target.checked })} className="size-5 accent-[var(--accent)]" />
              미성년자가 있어요
            </label>
            {consent.hasMinor && (
              <label className="flex min-h-10 items-center gap-2">
                <input
                  type="checkbox"
                  checked={consent.guardianConsent}
                  onChange={(e) => setConsent({ guardianConsent: e.target.checked })}
                  className="size-5 accent-[var(--accent)]"
                />
                보호자 동의를 받았어요 (필수)
              </label>
            )}
            {!memoOpen && (
              <button type="button" onClick={() => setMemoOpen(true)} className="ml-auto min-h-10 text-sm font-semibold text-accent">
                메모 더 적기
              </button>
            )}
          </div>
          {memoOpen && (
            <label className="flex flex-col gap-1 text-sm">
              메모 <span className="text-xs text-quiet">(서면 · 메시지 · 구두 등 동의 방법)</span>
              <input maxLength={500} value={consent.note} onChange={(e) => setConsent({ note: e.target.value })} className={inputClass} />
            </label>
          )}
        </div>
      )}
    </fieldset>
  );
}

/** 고급 설정: 분류 · 공개 범위 · 댓글 · 촬영 정보 · 가림 표시 (코스프레 · 기타만) */
function AdvancedFields({
  bundle,
  disabled,
  onChange,
}: {
  bundle: Bundle;
  disabled: boolean;
  onChange(patch: Partial<Pick<Bundle, "category" | "hasPeople" | "visibility" | "commentPolicy" | "showExif" | "veil">>): void;
}) {
  const field = "min-h-11 w-full rounded-xl border border-line bg-bg px-3 text-base";
  // 지난번 값으로 기억 (가림은 글마다 다르므로 빼고)
  const change = (patch: Parameters<typeof onChange>[0]) => {
    onChange(patch);
    const { visibility, commentPolicy, showExif } = patch;
    if (visibility !== undefined || commentPolicy !== undefined || showExif !== undefined)
      rememberAudience({ ...(visibility && { visibility }), ...(commentPolicy && { commentPolicy }), ...(showExif !== undefined && { showExif }) });
  };
  const showVeil = veilOffered(bundle.category) || bundle.veil !== null;
  const summary = [
    CATEGORY_LABEL[bundle.category],
    VISIBILITY_LABEL[bundle.visibility].title + " 공개",
    COMMENT_POLICY_LABEL[bundle.commentPolicy],
    bundle.showExif ? "촬영 정보 보임" : "촬영 정보 숨김",
    bundle.veil ? "가림 표시" : null,
  ].filter(Boolean);
  return (
    <details className="rounded-xl border border-line px-4 py-2">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
        <span className="shrink-0 font-semibold">고급 설정</span>
        <span className="min-w-0 truncate text-xs text-quiet">{summary.join(" · ")}</span>
        <span aria-hidden="true" className="ml-auto text-quiet">
          ▾
        </span>
      </summary>
      <fieldset className="mt-2 mb-2 flex flex-col gap-3" disabled={disabled}>
        <legend className="sr-only">고급 설정</legend>
        <div className="flex flex-col gap-1.5 text-sm">
          분류
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={bundle.category === c}
                // 분류를 바꾸면 사람 여부도 그 분류의 기본으로 (동의 기록은 남겨 둔다)
                onClick={() => change({ category: c, hasPeople: peopleByDefault(c) })}
                className="min-h-9 rounded-full border border-line px-3 text-sm aria-pressed:border-text aria-pressed:bg-text aria-pressed:text-bg"
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            공개 범위
            <select value={bundle.visibility} onChange={(e) => change({ visibility: e.target.value as Visibility })} className={field}>
              {VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {VISIBILITY_LABEL[v].title}
                </option>
              ))}
            </select>
            <span className="text-xs text-quiet">{VISIBILITY_LABEL[bundle.visibility].help}</span>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            댓글
            <select value={bundle.commentPolicy} onChange={(e) => change({ commentPolicy: e.target.value as CommentPolicy })} className={field}>
              {COMMENT_POLICIES.map((c) => (
                <option key={c} value={c}>
                  {COMMENT_POLICY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={bundle.showExif} onChange={(e) => change({ showExif: e.target.checked })} className="size-5 accent-[var(--accent)]" />
          촬영 정보(카메라 · 렌즈 · 설정) 보여 주기 <span className="text-xs text-quiet">위치는 항상 지워져요</span>
        </label>
        {showVeil && <VeilSelect value={bundle.veil} onChange={(veil) => change({ veil })} className={field} />}
      </fieldset>
    </details>
  );
}

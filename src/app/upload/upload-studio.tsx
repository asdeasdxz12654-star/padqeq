"use client";

import exifr from "exifr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  MAX_INPUT_BYTES,
  MAX_PHOTOS_PER_POST,
  type ConsentInput,
} from "@/lib/photos/post-input";
import { VARIANT_NAMES, VARIANTS, type VariantName } from "@/lib/photos/variants";
import { MIN_YEAR } from "@/lib/year-chips";
import { createDraft, discardDraft, publishPost } from "./actions";
import type { ConvertMessage, ConvertRequest } from "./convert.worker";

// 1차 지원 형식: 브라우저가 바로 여는 것. HEIC · RAW는 다음 단계(변환 라이브러리)에서.
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif"];
const UPLOAD_CONCURRENCY = 3;

type Item = {
  id: string;
  name: string;
  takenAt: string | null;
  status: "converting" | "ready" | "error";
  progress: number;
  error?: string;
  preview?: string;
  result?: { width: number; height: number; files: Record<VariantName, Blob> };
};

type Phase = { kind: "edit" } | { kind: "uploading"; sent: number; total: number } | { kind: "publishing" };

const inputClass = "min-h-11 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-accent";

export function UploadStudio({ isAdmin, currentYear }: { isAdmin: boolean; currentYear: number }) {
  const router = useRouter();
  const worker = useRef<Worker | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "edit" });
  // 파일을 올리다 실패하면 같은 초안으로 다시 시도한다
  const [draft, setDraft] = useState<{ postId: string; photoIds: string[] } | null>(null);
  const [, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("cosplay");
  const [hasPeople, setHasPeople] = useState(true);
  const [shotYear, setShotYear] = useState<number | null>(null);
  const [consent, setConsent] = useState<ConsentInput>({
    subjectLabel: "",
    consentedOn: "",
    note: "",
    hasMinor: false,
    guardianConsent: false,
  });

  // 변환 작업 스레드 (화면이 멈추지 않게)
  useEffect(() => {
    const w = new Worker(new URL("./convert.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (event: MessageEvent<ConvertMessage>) => {
      const message = event.data;
      setItems((list) =>
        list.map((item) => {
          if (item.id !== message.id) return item;
          if (message.type === "progress") return { ...item, progress: message.done / message.total };
          if (message.type === "error") return { ...item, status: "error", error: message.message };
          return {
            ...item,
            status: "ready",
            progress: 1,
            preview: URL.createObjectURL(message.files["400"]),
            result: { width: message.width, height: message.height, files: message.files },
          };
        }),
      );
    };
    worker.current = w;
    return () => w.terminate();
  }, []);

  // 미리보기 주소 정리
  const previews = useRef(new Set<string>());
  useEffect(() => {
    for (const item of items) if (item.preview) previews.current.add(item.preview);
  }, [items]);
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // 창을 닫으면 변환 · 업로드가 끊긴다
  const busy = items.some((i) => i.status === "converting") || phase.kind !== "edit";
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function addFiles(fileList: FileList | null) {
    if (!fileList || draft) return;
    setNotice(null);
    const skipped: string[] = [];
    const room = MAX_PHOTOS_PER_POST - items.length;
    const accepted: { item: Item; file: File }[] = [];
    for (const file of Array.from(fileList)) {
      if (!ACCEPT.includes(file.type)) skipped.push(`${file.name} (형식: HEIC · RAW는 곧 지원)`);
      else if (file.size > MAX_INPUT_BYTES) skipped.push(`${file.name} (50MB 초과)`);
      else if (accepted.length >= room) skipped.push(`${file.name} (한 게시물 ${MAX_PHOTOS_PER_POST}장까지)`);
      else {
        const takenAt = await readTakenAt(file);
        accepted.push({ file, item: { id: crypto.randomUUID(), name: file.name, takenAt, status: "converting", progress: 0 } });
      }
    }
    if (skipped.length) setNotice(`올리지 않은 파일: ${skipped.join(", ")}`);
    if (!accepted.length) return;

    setItems((list) => [...list, ...accepted.map((a) => a.item)]);
    for (const { item, file } of accepted) {
      worker.current?.postMessage({ id: item.id, file } satisfies ConvertRequest);
    }
  }

  const move = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved!);
      return next;
    });

  const remove = (id: string) => setItems((list) => list.filter((item) => item.id !== id));

  // 촬영 연도: 직접 고르지 않았으면 EXIF 촬영일 중 가장 이른 날 → 올해
  const earliest = items
    .map((i) => i.takenAt)
    .filter((t): t is string => t !== null)
    .sort()[0];
  const exifYear = earliest ? new Date(earliest).getFullYear() : null;
  const effectiveYear = shotYear ?? (exifYear && exifYear >= MIN_YEAR && exifYear <= currentYear ? exifYear : currentYear);

  const ready = items.length > 0 && items.every((i) => i.status === "ready");
  const needsConsent = hasPeople;
  const consentComplete =
    !needsConsent ||
    (consent.subjectLabel.trim() !== "" && consent.consentedOn !== "" && (!consent.hasMinor || consent.guardianConsent));
  const canSubmit = ready && title.trim() !== "" && consentComplete && phase.kind === "edit" && (isAdmin || !needsConsent);

  async function uploadFiles(photoIds: string[]) {
    const jobs = items.flatMap((item, index) =>
      VARIANT_NAMES.map((name) => ({ photoId: photoIds[index]!, name, blob: item.result!.files[name] })),
    );
    let sent = 0;
    setPhase({ kind: "uploading", sent, total: jobs.length });

    const put = async (job: (typeof jobs)[number]) => {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(`/api/photos/${job.photoId}/${job.name}`, {
          method: "PUT",
          body: job.blob,
          headers: { "Content-Type": VARIANTS[job.name].format === "avif" ? "image/avif" : "image/jpeg" },
        });
        if (res.ok) break;
        // 서버가 파일을 거부한 경우(4xx)는 다시 보내도 같다
        if (attempt >= 2 || (res.status >= 400 && res.status < 500)) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? "사진을 올리지 못했어요");
        }
      }
      setPhase({ kind: "uploading", sent: ++sent, total: jobs.length });
    };

    const queue = [...jobs];
    await Promise.all(
      Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
        for (let job = queue.shift(); job; job = queue.shift()) await put(job);
      }),
    );
  }

  async function submit() {
    setError(null);
    try {
      let current = draft;
      if (!current) {
        const created = await createDraft({
          title,
          body,
          category,
          shotYear: effectiveYear,
          shotOn: earliest ? localDate(earliest) : null,
          hasPeople,
          photos: items.map((item) => ({
            width: item.result!.width,
            height: item.result!.height,
            bytes: item.result!.files["4000"].size,
            takenAt: item.takenAt,
          })),
        });
        if (!created.ok) throw new Error(created.error);
        current = created.data;
        setDraft(current);
      }

      await uploadFiles(current.photoIds);

      setPhase({ kind: "publishing" });
      const published = await publishPost({ postId: current.postId }, needsConsent ? consent : null);
      if (!published.ok) throw new Error(published.error);

      startTransition(() => {
        router.push("/");
        router.refresh();
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드하지 못했어요");
      setPhase({ kind: "edit" });
    }
  }

  async function giveUp() {
    if (draft) await discardDraft({ postId: draft.postId });
    setDraft(null);
    setItems([]);
    setError(null);
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* 사진 */}
      <section aria-labelledby="photos-heading" className="flex flex-col gap-4">
        <h2 id="photos-heading" className="sr-only">
          사진
        </h2>
        <label
          className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 text-center ${
            draft ? "pointer-events-none opacity-50" : "hover:border-accent"
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void addFiles(e.dataTransfer.files);
          }}
        >
          <span className="font-semibold">사진을 끌어다 놓거나 눌러서 고르기</span>
          <span className="text-xs text-quiet">
            JPEG · PNG · WebP · AVIF, 장당 50MB, 게시물 하나에 {MAX_PHOTOS_PER_POST}장까지
          </span>
          <input
            type="file"
            multiple
            accept={ACCEPT.join(",")}
            className="sr-only"
            disabled={Boolean(draft)}
            onChange={(e) => {
              void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {notice && <p className="text-xs text-quiet">{notice}</p>}

        {items.length > 0 && (
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((item, index) => (
              <li key={item.id} className="flex flex-col gap-1.5">
                <div className="photo-guard relative aspect-square overflow-hidden rounded-xl bg-slot">
                  {item.preview && (
                    // 내 브라우저에서 만든 미리보기(blob:)라 이미지 게이트를 거치지 않는다
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.preview} alt="" draggable={false} className="size-full object-cover" />
                  )}
                  {index === 0 && (
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-bg/80 px-2 py-0.5 text-[11px] font-semibold">
                      대표
                    </span>
                  )}
                  {item.status === "converting" && (
                    <span className="absolute inset-x-0 bottom-0 h-1 bg-line">
                      <span className="block h-full bg-accent" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-quiet" title={item.name}>
                  {item.status === "error" ? <span className="text-red-300">실패 · {item.error}</span> : item.name}
                </p>
                {!draft && (
                  <div className="flex gap-1 text-xs">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`${item.name} 앞으로`}
                      className="rounded-lg border border-line px-2 py-1 disabled:opacity-40"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`${item.name} 뒤로`}
                      className="rounded-lg border border-line px-2 py-1 disabled:opacity-40"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="ml-auto rounded-lg border border-line px-2 py-1 text-quiet"
                    >
                      빼기
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 정보 */}
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void submit();
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          제목
          <input
            required
            maxLength={80}
            value={title}
            disabled={Boolean(draft)}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          설명 <span className="text-xs font-normal text-quiet">(선택)</span>
          <textarea
            rows={3}
            maxLength={2000}
            value={body}
            disabled={Boolean(draft)}
            onChange={(e) => setBody(e.target.value)}
            className={`${inputClass} py-2`}
          />
        </label>

        <fieldset className="flex flex-col gap-2" disabled={Boolean(draft)}>
          <legend className="mb-1.5 text-sm font-medium">카테고리</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <label
                key={c}
                className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-accent has-checked:bg-accent has-checked:text-on-accent"
              >
                <input
                  type="radio"
                  name="category"
                  value={c}
                  checked={category === c}
                  onChange={() => {
                    setCategory(c);
                    setHasPeople(c !== "landscape");
                  }}
                  className="sr-only"
                />
                {CATEGORY_LABEL[c]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          촬영 연도
          <select
            value={effectiveYear}
            disabled={Boolean(draft)}
            onChange={(e) => setShotYear(Number(e.target.value))}
            className={inputClass}
          >
            {Array.from({ length: currentYear - MIN_YEAR + 1 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y}>
                {y}
                {y === exifYear ? " (사진 촬영일)" : ""}
              </option>
            ))}
          </select>
          <span className="text-xs font-normal text-quiet">홈의 연도 칩 기준이에요.</span>
        </label>

        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={hasPeople}
            disabled={Boolean(draft)}
            onChange={(e) => setHasPeople(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          사진에 사람이 나와요
        </label>

        {hasPeople && (
          <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-4" disabled={Boolean(draft)}>
            <legend className="px-1 text-sm font-semibold">촬영 동의 기록 (비공개)</legend>
            {!isAdmin && (
              <p className="text-xs text-red-300">지금은 운영자만 사람이 나오는 사진을 게시할 수 있어요.</p>
            )}
            <label className="flex flex-col gap-1.5 text-sm">
              사진 속 인물
              <input
                maxLength={60}
                placeholder="예: 코스어 @moon_cos"
                value={consent.subjectLabel}
                onChange={(e) => setConsent({ ...consent, subjectLabel: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              동의 받은 날
              <input
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={consent.consentedOn}
                onChange={(e) => setConsent({ ...consent, consentedOn: e.target.value })}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              메모 <span className="text-xs text-quiet">(서면 · 메시지 · 구두 등 동의 방법)</span>
              <input
                maxLength={500}
                value={consent.note}
                onChange={(e) => setConsent({ ...consent, note: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={consent.hasMinor}
                onChange={(e) => setConsent({ ...consent, hasMinor: e.target.checked })}
                className="size-5 accent-[var(--accent)]"
              />
              미성년자가 있어요
            </label>
            {consent.hasMinor && (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent.guardianConsent}
                  onChange={(e) => setConsent({ ...consent, guardianConsent: e.target.checked })}
                  className="size-5 accent-[var(--accent)]"
                />
                보호자 동의를 받았어요 (필수)
              </label>
            )}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-12 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-50"
        >
          {phase.kind === "uploading"
            ? `올리는 중… ${phase.sent} / ${phase.total}`
            : phase.kind === "publishing"
              ? "게시하는 중…"
              : draft
                ? "다시 시도"
                : "게시하기"}
        </button>
        {!ready && items.length > 0 && <p className="text-xs text-quiet">사진 변환이 끝나면 게시할 수 있어요.</p>}
        {draft && phase.kind === "edit" && (
          <button type="button" onClick={() => void giveUp()} className="text-sm text-quiet underline underline-offset-4">
            이번 업로드 그만두기
          </button>
        )}
      </form>
    </div>
  );
}

async function readTakenAt(file: File): Promise<string | null> {
  try {
    const data = await exifr.parse(file, ["DateTimeOriginal"]);
    const date: unknown = data?.DateTimeOriginal;
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  } catch {
    return null;
  }
}

/** 촬영 시각을 이 기기 시간대의 날짜로 (EXIF에는 시간대가 없다) */
function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

"use client";

import { useLeaveWarning } from "@/lib/ui/use-details-dismiss";
import { loadAudienceDefaults } from "./audience-defaults";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { groupByShootingTime, timeRange } from "@/lib/photos/grouping";
import { MAX_PHOTOS_PER_POST } from "@/lib/photos/post-input";
import { type Category, peopleByDefault } from "@/lib/photos/write-defaults";
import { type Bundle, BundleCard, bundleProblem, effectiveYear, emptyConsent, titleFor } from "./bundle-card";
import { discardDraft } from "./actions";
import type { CreditDraft } from "./credit-editor";
import { toCreditInput } from "./credit-editor";
import { localDate, publishBundle } from "./publish-bundle";
import { isMobileDevice } from "./raw-decoder";
import { ACCEPT_INPUT, MAX_SESSION_PHOTOS, type Photo, useConverter } from "./use-converter";

// 글쓰기 › 사진 올리기 (A-02 · S-08, 캔버스 36–40).
// 고른 사진은 게시물 하나로 (20장이 넘으면 20장씩). 많이 올리면(21장 이상 · 촬영 시각이 1시간 넘게 벌어짐)
// 촬영 시각으로 나누기를 제안한다. 게시물이 여럿이면 탭으로 하나씩 보고, 태그 · 크레딧 · 동의 기록은 체크 하나로 모두에 똑같이.
// 사진은 변환하자마자 미리 올려 두므로(업로드 자리) 한 번에 500장까지 다룬다.

/** 다른 게시물에도 똑같이 맞추는 칸 */
type Shared = Pick<Bundle, "tags" | "credits" | "hasPeople" | "consent">;
const SHARED_KEYS = ["tags", "credits", "hasPeople", "consent"] as const;

const freshCredits = (credits: CreditDraft[]) => credits.map((c) => ({ ...c, key: crypto.randomUUID() }));

function newBundle(photoIds: string[], category: Category, shared: Shared, audience = loadAudienceDefaults()): Bundle {
  return {
    id: crypto.randomUUID(),
    photoIds,
    title: "",
    body: "",
    category,
    hasPeople: shared.hasPeople,
    shotYear: null,
    consent: { ...shared.consent },
    tags: [...shared.tags],
    credits: freshCredits(shared.credits),
    // 지난번 고른 공개 범위 · 댓글 · 촬영 정보 표시를 미리 채운다
    visibility: audience.visibility,
    commentPolicy: audience.commentPolicy,
    showExif: audience.showExif,
    veil: null,
    draft: null,
    state: { kind: "edit" },
  };
}

const editable = (b: Bundle) => b.state.kind === "edit" && b.draft === null;

export function UploadStudio({
  category,
  viewerHandle,
  currentYear,
  initialTags = [],
}: {
  category: Category;
  viewerHandle: string | null;
  currentYear: number;
  /** 처음부터 붙일 태그 (행사 끝난 뒤 알림에서 오면 행사 · 장소 태그) */
  initialTags?: Bundle["tags"];
}) {
  const router = useRouter();
  const inputId = useId();
  const { photos, addFiles, release, retry } = useConverter({ stage: true });
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [current, setCurrent] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // 태그 · 크레딧 · 동의 기록을 모든 게시물에 똑같이 (게시물이 여럿일 때만 보인다)
  const [sync, setSync] = useState(true);
  // 나누기 제안을 닫았는지 (다음에 사진을 더 고르면 다시 본다)
  const [splitAnswered, setSplitAnswered] = useState(false);
  // 처음 넣는 크레딧: 올린 사람 = 찍은 사람이 대부분 ('촬영 · 나', 아니면 빼면 된다)
  const [starter] = useState<Shared>(() => ({
    tags: initialTags,
    credits: viewerHandle ? [{ key: crypto.randomUUID(), kind: "member", role: "photographer", handle: viewerHandle }] : [],
    hasPeople: peopleByDefault(category),
    consent: emptyConsent(),
  }));

  const photosOf = (bundle: Bundle) => bundle.photoIds.map((id) => photos[id]).filter((p): p is Photo => Boolean(p));
  const pending = bundles.filter((b) => b.state.kind !== "published");
  const sessionCount = pending.reduce((n, b) => n + b.photoIds.length, 0);
  const shown = bundles[Math.min(current, bundles.length - 1)];

  // 변환 · 업로드 중에 창을 닫으면 작업이 끊긴다
  const busy = running || Object.values(photos).some((p) => p.status === "converting" || p.status === "uploading");
  // 다른 화면에서 넘어오면 교차 출처 격리(RAW 고화질 현상)가 꺼져 있다. PC에서는 처음 한 번만 새로 불러 켠다.
  useEffect(() => {
    if (isMobileDevice()) return;
    try {
      if (globalThis.crossOriginIsolated) return sessionStorage.removeItem("upload-isolation-reload");
      if (sessionStorage.getItem("upload-isolation-reload")) return;
      sessionStorage.setItem("upload-isolation-reload", "1");
    } catch {
      return;
    }
    window.location.reload();
  }, []);

  // 작업 중에 창을 닫으면 끊긴다
  useLeaveWarning(busy);

  // 지금 맞출 기준: 첫 번째 손댈 수 있는 게시물 (없으면 처음 값)
  const sharedNow = (): Shared => {
    const base = bundles.find(editable);
    return base ? { tags: base.tags, credits: base.credits, hasPeople: base.hasPeople, consent: base.consent } : starter;
  };

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const { added, skipped } = await addFiles(Array.from(list), MAX_SESSION_PHOTOS - sessionCount);
    if (skipped.length) setNotice(`올리지 않은 파일: ${skipped.join(", ")}`);
    if (!added.length) return;
    setSplitAnswered(false);
    const shared = sharedNow();
    // 아직 올리기 전인 마지막 게시물에 이어 담고, 20장이 넘치면 다음 게시물로
    setBundles((list) => {
      const ids = added.map((p) => p.id);
      const last = list.at(-1);
      const open = last && editable(last) ? last : null;
      const room = open ? Math.max(0, MAX_PHOTOS_PER_POST - open.photoIds.length) : 0;
      const head = ids.slice(0, room);
      const rest = ids.slice(room);
      const chunks: string[][] = [];
      for (let i = 0; i < rest.length; i += MAX_PHOTOS_PER_POST) chunks.push(rest.slice(i, i + MAX_PHOTOS_PER_POST));
      const kept = open && head.length ? list.map((b) => (b.id === open.id ? { ...b, photoIds: [...b.photoIds, ...head] } : b)) : list;
      return [...kept, ...chunks.map((c) => newBundle(c, open?.category ?? category, shared))];
    });
    // 새 사진이 처음 담긴 게시물을 보여 준다 (이어 담았으면 그 게시물, 아니면 새로 만든 첫 게시물)
    const last = bundles.at(-1);
    const continued = last && editable(last) && last.photoIds.length < MAX_PHOTOS_PER_POST;
    setCurrent(continued ? bundles.length - 1 : bundles.length);
  }

  // 화면이 준비되기 전에 고른 사진 (느린 휴대폰에서 고르기 창이 먼저 열린 경우)
  useEffect(() => {
    const timer = setTimeout(() => {
      const input = document.getElementById(inputId);
      if (input instanceof HTMLInputElement && input.files?.length) void onFiles(input.files).then(() => (input.value = ""));
    }, 0);
    return () => clearTimeout(timer);
    // 처음 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 손댈 수 있는 사진 전체를 촬영 시각으로 나눴을 때. 지금 나뉜 모양과 다를 때만 제안한다.
  const loose = bundles.filter(editable);
  const loosePhotos = loose.flatMap(photosOf);
  const groups = groupByShootingTime(loosePhotos);
  const span = timeRange(loosePhotos);
  const spanHours = span ? (Date.parse(span.end) - Date.parse(span.start)) / 3_600_000 : 0;
  const idsKey = (ids: string[]) => [...ids].sort().join();
  const samePartition = groups.length === loose.length && groups.every((g, i) => idsKey(g.map((p) => p.id)) === idsKey(loose[i]!.photoIds));
  const suggestSplit = !splitAnswered && groups.length > 1 && !samePartition && (loosePhotos.length > MAX_PHOTOS_PER_POST || spanHours > 1);

  function splitByTime() {
    const first = loose[0];
    if (!first) return;
    setBundles((list) => {
      const fixed = list.filter((b) => !editable(b));
      const made = groups.map((g, i) => ({ ...newBundle(g.map((p) => p.id), first.category, first), ...(i === 0 && { title: first.title, body: first.body }) }));
      return [...fixed, ...made];
    });
    setCurrent(bundles.filter((b) => !editable(b)).length);
    setSplitAnswered(true);
  }

  const update = (id: string, patch: Partial<Bundle>) =>
    setBundles((list) => {
      const shared = sync && list.filter(editable).length > 1 ? SHARED_KEYS.filter((k) => k in patch) : [];
      return list.map((b) => {
        if (b.id === id) return { ...b, ...patch };
        if (!shared.length || !editable(b)) return b;
        const copy: Partial<Bundle> = {};
        for (const k of shared) {
          if (k === "credits") copy.credits = freshCredits(patch.credits ?? []);
          else if (k === "consent") copy.consent = { ...patch.consent! };
          else if (k === "tags") copy.tags = [...(patch.tags ?? [])];
          else copy.hasPeople = patch.hasPeople!;
        }
        return { ...b, ...copy };
      });
    });

  /** 사진을 같은 게시물 안 다른 자리로 */
  function movePhoto(bundleId: string, photoId: string, toIndex: number) {
    setBundles((list) =>
      list.map((b) => {
        if (b.id !== bundleId) return b;
        const ids = b.photoIds.filter((id) => id !== photoId);
        ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, photoId);
        return { ...b, photoIds: ids };
      }),
    );
  }

  /** 앞 · 뒤 게시물로 옮기기. 옮길 게시물이 꽉 찼거나 손댈 수 없으면 새 게시물을 만든다. */
  function transferPhoto(bundleId: string, photoId: string, direction: -1 | 1) {
    setBundles((list) => {
      const index = list.findIndex((b) => b.id === bundleId);
      const source = list[index];
      const target = list[index + direction];
      if (!source) return list;
      const ok = target && editable(target) && target.photoIds.length < MAX_PHOTOS_PER_POST;
      const next = list.map((b) => (b.id === bundleId ? { ...b, photoIds: b.photoIds.filter((id) => id !== photoId) } : b));
      if (ok) {
        return next.map((b) => (b.id === target.id ? { ...b, photoIds: direction === -1 ? [...b.photoIds, photoId] : [photoId, ...b.photoIds] } : b));
      }
      next.splice(direction === -1 ? index : index + 1, 0, newBundle([photoId], source.category, source));
      return next.filter((b) => b.photoIds.length > 0 || b.state.kind === "published");
    });
  }

  function removePhoto(bundleId: string, photoId: string) {
    release([photoId]);
    setBundles((list) =>
      list
        .map((b) => (b.id === bundleId ? { ...b, photoIds: b.photoIds.filter((id) => id !== photoId) } : b))
        .filter((b) => b.photoIds.length > 0 || b.state.kind === "published"),
    );
  }

  async function publishOne(bundle: Bundle): Promise<boolean> {
    const list = photosOf(bundle);
    if (bundleProblem(bundle, list)) return false;
    const range = timeRange(list);
    try {
      const postId = await publishBundle(
        {
          title: titleFor(bundle, list),
          body: bundle.body,
          category: bundle.category,
          hasPeople: bundle.hasPeople,
          shotYear: effectiveYear(bundle, list, currentYear).year,
          shotOn: range ? localDate(range.start) : null,
          consent: bundle.consent,
          tagIds: bundle.tags.map((t) => t.id),
          credits: bundle.credits.map(toCreditInput),
          visibility: bundle.visibility,
          commentPolicy: bundle.commentPolicy,
          scheduledAt: "",
          showExif: bundle.showExif,
          veil: bundle.veil,
        },
        list,
        bundle.draft,
        {
          onDraft: (draft) => update(bundle.id, { draft }),
          onProgress: (sent, total) => update(bundle.id, { state: { kind: "uploading", sent, total } }),
          onPublishing: () => update(bundle.id, { state: { kind: "publishing" } }),
        },
      );
      update(bundle.id, { state: { kind: "published", postId } });
      // 게시한 사진의 변환본은 더 들고 있을 필요가 없다
      release(bundle.photoIds, { published: true });
      return true;
    } catch (e) {
      update(bundle.id, { state: { kind: "error", message: e instanceof Error ? e.message : "게시하지 못했어요" } });
      return false;
    }
  }

  async function publishAll() {
    setRunning(true);
    try {
      // 한 번에 한 게시물씩 (업로드 대역 · 서버 부담 분산)
      for (const bundle of bundles) {
        if (bundle.state.kind === "published") continue;
        await publishOne(bundle);
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  async function giveUpDrafts() {
    // 초안까지만 만들고 멈춘 게시물 정리
    for (const b of bundles) {
      if (b.draft && b.state.kind !== "published") await discardDraft({ postId: b.draft.postId });
    }
    release(pending.flatMap((b) => b.photoIds));
    setBundles((list) => list.filter((b) => b.state.kind === "published"));
  }

  const ready = pending.filter((b) => bundleProblem(b, photosOf(b)) === null);
  const firstProblem = pending.map((b) => bundleProblem(b, photosOf(b))).find((p) => p !== null) ?? null;
  const hasDrafts = pending.some((b) => b.draft);
  const allDone = bundles.length > 0 && pending.length === 0;
  const working = bundles.find((b) => b.state.kind === "uploading" || b.state.kind === "publishing")?.state;

  const publishBar = pending.length > 0 && (
    <div className="flex flex-col gap-2">
      {pending.filter(editable).length > 1 && (
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          태그 · 크레딧 · 동의 기록을 다른 게시물에도 똑같이
        </label>
      )}
      <button
        type="button"
        disabled={running || ready.length === 0 || ready.length < pending.length}
        onClick={() => void publishAll()}
        className="min-h-12 w-full rounded-xl bg-accent px-5 font-bold text-on-accent disabled:opacity-50"
      >
        {working?.kind === "uploading"
          ? `게시하는 중… ${working.sent} / ${working.total}`
          : running
            ? "게시하는 중…"
            : pending.length > 1
              ? `${pending.length}개 모두 게시`
              : hasDrafts
                ? "다시 시도"
                : "게시"}
      </button>
      {!running &&
        firstProblem &&
        (firstProblem.startsWith("동의 기록") ? (
          <button type="button" onClick={() => document.getElementById("consent")?.scrollIntoView({ behavior: "smooth", block: "center" })} className="min-h-9 text-center text-xs text-accent underline underline-offset-2">
            {firstProblem} ↑
          </button>
        ) : (
          <p className="text-center text-xs text-quiet">{firstProblem}</p>
        ))}
      {hasDrafts && !running && (
        <button type="button" onClick={() => void giveUpDrafts()} className="text-sm text-quiet underline underline-offset-4">
          남은 업로드 모두 그만두기
        </button>
      )}
    </div>
  );

  return (
    <div className="mt-6 flex flex-col gap-5 pb-28 md:pb-0">
      <input
        id={inputId}
        type="file"
        multiple
        accept={ACCEPT_INPUT}
        className="sr-only"
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {bundles.length === 0 && (
        <label
          htmlFor={inputId}
          className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 text-center hover:border-accent"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
        >
          <span aria-hidden="true" className="text-3xl leading-none text-quiet">
            +
          </span>
          <span className="font-semibold">
            사진 고르기<span className="hidden md:inline"> · 끌어다 놓아도 돼요</span>
          </span>
          <span className="text-xs leading-relaxed text-quiet">
            JPEG · HEIC · PNG · WebP · AVIF · RAW, 한 번에 {MAX_SESSION_PHOTOS}장까지 · 게시물 하나에 {MAX_PHOTOS_PER_POST}장
            <br />
            원본 파일은 서버에 저장하지 않으니 따로 보관해 주세요
          </span>
        </label>
      )}
      {notice && <p className="text-xs text-quiet">{notice}</p>}

      {suggestSplit && (
        <div role="status" className="flex flex-col gap-2 rounded-2xl bg-surface p-4 text-sm">
          <p>
            <strong>
              사진 {loosePhotos.length}장{spanHours > 1 ? ` · 촬영 시각이 ${Math.round(spanHours)}시간에 걸쳐 있어요` : ""}
            </strong>
            <span className="block text-xs text-quiet">장면마다 게시물을 나누면 보기 좋아요. 30분 넘게 떨어진 곳에서 나눠요.</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={splitByTime} className="min-h-10 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">
              {groups.length}개로 나누기
            </button>
            <button type="button" onClick={() => setSplitAnswered(true)} className="min-h-10 rounded-xl border border-line px-4 text-sm">
              {loosePhotos.length > MAX_PHOTOS_PER_POST ? `${MAX_PHOTOS_PER_POST}장씩 그대로` : "하나로 그대로"}
            </button>
          </div>
        </div>
      )}

      {bundles.length > 1 && (
        <div role="tablist" aria-label="게시물" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
          {bundles.map((b, i) => {
            const done = b.state.kind === "published";
            const ok = !done && bundleProblem(b, photosOf(b)) === null;
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={shown?.id === b.id}
                onClick={() => setCurrent(i)}
                className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-line px-3.5 text-sm aria-selected:border-text aria-selected:bg-text aria-selected:text-bg"
              >
                {i + 1} · {b.photoIds.length}장{done ? " · 게시됨" : ok ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      )}

      {shown && (
        <BundleCard
          key={shown.id}
          bundle={shown}
          photos={photosOf(shown)}
          viewerHandle={viewerHandle}
          currentYear={currentYear}
          bundleCount={bundles.length}
          index={bundles.indexOf(shown)}
          addInputId={inputId}
          footer={publishBar}
          onChange={(patch) => update(shown.id, patch)}
          onMovePhoto={(photoId, to) => movePhoto(shown.id, photoId, to)}
          onTransferPhoto={(photoId, direction) => transferPhoto(shown.id, photoId, direction)}
          onRemovePhoto={(photoId) => removePhoto(shown.id, photoId)}
          onRetryPhoto={retry}
        />
      )}

      {allDone && (
        <p role="status" className="text-sm text-quiet">
          모두 게시했어요. 사진을 더 고르면 새 게시물로 이어서 올릴 수 있어요.{" "}
          <label htmlFor={inputId} className="cursor-pointer font-semibold text-accent underline underline-offset-4">
            사진 더 고르기
          </label>
        </p>
      )}

      {/* 휴대폰: 아래 탭 위에 붙는 게시 줄 (PC는 오른쪽 칸 맨 아래) */}
      {publishBar && (
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-30 border-t border-line bg-bg/95 px-4 pt-3 pb-3 backdrop-blur md:hidden">
          {publishBar}
        </div>
      )}
    </div>
  );
}

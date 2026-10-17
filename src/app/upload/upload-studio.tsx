"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { groupByShootingTime, timeRange } from "@/lib/photos/grouping";
import { MAX_PHOTOS_PER_POST, type ConsentInput } from "@/lib/photos/post-input";
import {
  type Bundle,
  BundleCard,
  bundleProblem,
  CategoryAndConsent,
  effectiveYear,
  emptyConsent,
} from "./bundle-card";
import { discardDraft } from "./actions";
import { TagPicker } from "./tag-picker";
import { CreditEditor, sameCredit, toCreditInput } from "./credit-editor";
import { localDate, publishBundle } from "./publish-bundle";
import { ACCEPT_INPUT, MAX_SESSION_PHOTOS, type Photo, useConverter } from "./use-converter";

// 업로드 (A-02 대량 업로드 · S-08).
// 사진을 여러 장 넣으면 촬영 시각 30분 간격으로 묶음(= 게시물)을 나눈다.
// 묶음마다 내용을 넣고, 공통 설정은 한 번에 적용한 뒤, 차례로 게시한다.
// 사진은 변환하자마자 미리 올려 두므로(업로드 자리) 한 번에 500장까지 다룬다.

type Common = { category: Bundle["category"]; hasPeople: boolean; consent: ConsentInput; tags: Bundle["tags"]; credits: Bundle["credits"] };

const newBundle = (photoIds: string[], common: Common): Bundle => ({
  id: crypto.randomUUID(),
  photoIds,
  title: "",
  body: "",
  category: common.category,
  hasPeople: common.hasPeople,
  shotYear: null,
  consent: { ...common.consent },
  tags: [...common.tags],
  credits: common.credits.map((c) => ({ ...c, key: crypto.randomUUID() })),
  rawConfirmed: false,
  visibility: "public",
  commentPolicy: "everyone",
  scheduledAt: "",
  showExif: true,
  veil: null,
  draft: null,
  state: { kind: "edit" },
});

export function UploadStudio({
  isAdmin,
  viewerHandle,
  currentYear,
  initialTags = [],
}: {
  isAdmin: boolean;
  viewerHandle: string | null;
  currentYear: number;
  /** 처음부터 붙일 태그 (행사 끝난 뒤 알림에서 오면 행사 · 장소 태그) */
  initialTags?: Bundle["tags"];
}) {
  const router = useRouter();
  const { photos, addFiles, release, retry } = useConverter({ stage: true });
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [common, setCommon] = useState<Common>({ category: "cosplay", hasPeople: true, consent: emptyConsent(), tags: initialTags, credits: [] });
  const [running, setRunning] = useState(false);

  const photosOf = (bundle: Bundle) => bundle.photoIds.map((id) => photos[id]).filter((p): p is Photo => Boolean(p));
  const pending = bundles.filter((b) => b.state.kind !== "published");
  const sessionCount = pending.reduce((n, b) => n + b.photoIds.length, 0);

  // 변환 · 업로드 중에 창을 닫으면 작업이 끊긴다
  const busy = running || Object.values(photos).some((p) => p.status === "converting" || p.status === "uploading");
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    setNotice(null);
    const { added, skipped } = await addFiles(Array.from(list), MAX_SESSION_PHOTOS - sessionCount);
    if (skipped.length) setNotice(`올리지 않은 파일: ${skipped.join(", ")}`);
    if (!added.length) return;
    // 새로 넣은 사진끼리 촬영 시각으로 묶어 뒤에 붙인다 (이미 손본 묶음은 건드리지 않음)
    const groups = groupByShootingTime(added);
    setBundles((list) => [...list, ...groups.map((g) => newBundle(g.map((p) => p.id), common))]);
  }

  const update = (id: string, patch: Partial<Bundle>) =>
    setBundles((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  /** 사진 순서 바꾸기 (묶음 안) */
  function movePhoto(bundleId: string, photoId: string, delta: -1 | 1) {
    setBundles((list) =>
      list.map((b) => {
        if (b.id !== bundleId) return b;
        const ids = [...b.photoIds];
        const i = ids.indexOf(photoId);
        const j = i + delta;
        if (i < 0 || j < 0 || j >= ids.length) return b;
        [ids[i], ids[j]] = [ids[j]!, ids[i]!];
        return { ...b, photoIds: ids };
      }),
    );
  }

  /** 앞 · 뒤 묶음으로 옮기기. 옮길 묶음이 없거나 손댈 수 없으면 새 묶음을 만든다. */
  function transferPhoto(bundleId: string, photoId: string, direction: -1 | 1) {
    setBundles((list) => {
      const index = list.findIndex((b) => b.id === bundleId);
      const target = list[index + direction];
      const editable = target && target.state.kind === "edit" && !target.draft && target.photoIds.length < MAX_PHOTOS_PER_POST;
      const next = list.map((b) => (b.id === bundleId ? { ...b, photoIds: b.photoIds.filter((id) => id !== photoId) } : b));
      if (editable) {
        return next.map((b) =>
          b.id === target.id
            ? { ...b, photoIds: direction === -1 ? [...b.photoIds, photoId] : [photoId, ...b.photoIds] }
            : b,
        );
      }
      const created = newBundle([photoId], common);
      next.splice(direction === -1 ? index : index + 1, 0, created);
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

  function removeBundle(bundle: Bundle) {
    release(bundle.photoIds);
    setBundles((list) => list.filter((b) => b.id !== bundle.id));
  }

  function mergeNext(bundleId: string) {
    const i = bundles.findIndex((b) => b.id === bundleId);
    const a = bundles[i];
    const b = bundles[i + 1];
    if (!a || !b || b.draft || b.state.kind !== "edit") return;
    if (a.photoIds.length + b.photoIds.length > MAX_PHOTOS_PER_POST) {
      setNotice(`한 게시물은 ${MAX_PHOTOS_PER_POST}장까지라 합칠 수 없어요.`);
      return;
    }
    setBundles((list) =>
      list
        .map((x) => (x.id === a.id ? { ...x, photoIds: [...x.photoIds, ...b.photoIds] } : x))
        .filter((x) => x.id !== b.id),
    );
  }

  /** 공통 설정을 아직 게시하지 않은(손댈 수 있는) 묶음 모두에 적용 */
  function applyCommon() {
    setBundles((list) =>
      list.map((b) =>
        b.draft || b.state.kind !== "edit"
          ? b
          : {
              ...b,
              category: common.category,
              hasPeople: common.hasPeople,
              consent: { ...common.consent },
              // 공통 태그는 각 묶음 태그에 더한다 (10개까지)
              tags: [...b.tags, ...common.tags.filter((t) => !b.tags.some((x) => x.id === t.id))].slice(0, 10),
              // 공통 크레딧도 더한다 (같은 역할 · 같은 사람은 한 번만)
              credits: [
                ...b.credits,
                ...common.credits
                  .filter((c) => !b.credits.some((x) => sameCredit(x, c)))
                  .map((c) => ({ ...c, key: crypto.randomUUID() })),
              ].slice(0, 10),
            },
      ),
    );
  }

  async function publishOne(bundle: Bundle): Promise<boolean> {
    const list = photosOf(bundle);
    if (bundleProblem(bundle, list, isAdmin)) return false;
    const range = timeRange(list);
    try {
      const postId = await publishBundle(
        {
          title: bundle.title,
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
          scheduledAt: bundle.scheduledAt,
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
      update(bundle.id, { state: { kind: "error", message: e instanceof Error ? e.message : "업로드하지 못했어요" } });
      return false;
    }
  }

  async function publishAll() {
    setRunning(true);
    try {
      // 한 번에 한 묶음씩 (업로드 대역 · 서버 부담 분산)
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
    // 초안까지만 만들고 멈춘 묶음 정리
    for (const b of bundles) {
      if (b.draft && b.state.kind !== "published") await discardDraft({ postId: b.draft.postId });
    }
    release(pending.flatMap((b) => b.photoIds));
    setBundles((list) => list.filter((b) => b.state.kind === "published"));
  }

  const ready = pending.filter((b) => bundleProblem(b, photosOf(b), isAdmin) === null);
  const hasDrafts = pending.some((b) => b.draft);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 text-center hover:border-accent"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFiles(e.dataTransfer.files);
        }}
      >
        <span className="font-semibold">사진을 끌어다 놓거나 눌러서 고르기</span>
        <span className="text-xs leading-relaxed text-quiet">
          JPEG · HEIC(아이폰) · PNG · WebP · AVIF 장당 50MB · RAW(CR2 · CR3 · NEF · ARW · RAF · RW2 · ORF · DNG) PC 200MB · 휴대폰 100MB, 한 번에 {MAX_SESSION_PHOTOS}장까지
          <br />
          촬영 시각이 30분 넘게 떨어지면 다른 게시물로 자동으로 나눠요 (게시물 하나에 {MAX_PHOTOS_PER_POST}장까지)
        </span>
        <input
          type="file"
          multiple
          accept={ACCEPT_INPUT}
          className="sr-only"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {notice && <p className="text-xs text-quiet">{notice}</p>}

      {pending.length > 1 && (
        <details className="rounded-2xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">공통 설정 · 모든 묶음에 한 번에 적용</summary>
          <div className="mt-4 flex flex-col gap-4">
            <TagPicker value={common.tags} onChange={(tags) => setCommon((c) => ({ ...c, tags }))} disabled={false} isAdmin={isAdmin} />
            <CreditEditor
              value={common.credits}
              onChange={(credits) => setCommon((c) => ({ ...c, credits }))}
              disabled={false}
              viewerHandle={viewerHandle}
            />
            <CategoryAndConsent
              category={common.category}
              hasPeople={common.hasPeople}
              consent={common.consent}
              disabled={false}
              isAdmin={isAdmin}
              onChange={(patch) => setCommon((c) => ({ ...c, ...patch }))}
            />
            <button
              type="button"
              onClick={applyCommon}
              className="self-start rounded-xl border border-accent px-4 py-2 text-sm font-semibold text-accent"
            >
              아직 게시하지 않은 묶음 모두에 적용
            </button>
          </div>
        </details>
      )}

      {bundles.map((bundle, index) => (
        <BundleCard
          key={bundle.id}
          index={index}
          bundle={bundle}
          photos={photosOf(bundle)}
          isAdmin={isAdmin}
          viewerHandle={viewerHandle}
          currentYear={currentYear}
          hasPrev={index > 0}
          hasNext={index < bundles.length - 1}
          onChange={(patch) => update(bundle.id, patch)}
          onMovePhoto={(photoId, delta) => movePhoto(bundle.id, photoId, delta)}
          onTransferPhoto={(photoId, direction) => transferPhoto(bundle.id, photoId, direction)}
          onRemovePhoto={(photoId) => removePhoto(bundle.id, photoId)}
          onRetryPhoto={retry}
          onRemoveBundle={() => removeBundle(bundle)}
          onMergeNext={() => mergeNext(bundle.id)}
          onPublish={() => {
            setRunning(true);
            void publishOne(bundle).finally(() => {
              setRunning(false);
              router.refresh();
            });
          }}
        />
      ))}

      {pending.length > 0 && (
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-bg/95 p-3 backdrop-blur md:bottom-4">
          <button
            type="button"
            disabled={running || ready.length === 0}
            onClick={() => void publishAll()}
            className="min-h-12 rounded-xl bg-accent px-5 font-semibold text-on-accent disabled:opacity-50"
          >
            {running ? "게시하는 중…" : `준비된 묶음 모두 게시 (${ready.length} / ${pending.length})`}
          </button>
          {hasDrafts && !running && (
            <button type="button" onClick={() => void giveUpDrafts()} className="text-sm text-quiet underline underline-offset-4">
              남은 업로드 모두 그만두기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

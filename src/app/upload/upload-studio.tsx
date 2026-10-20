"use client";

import { loadAudienceDefaults } from "./audience-defaults";
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
import { isMobileDevice } from "./raw-decoder";
import { ACCEPT_INPUT, MAX_SESSION_PHOTOS, type Photo, useConverter } from "./use-converter";

// 업로드 (A-02 대량 업로드 · S-08).
// 기본은 고른 사진을 게시물 하나로 (20장이 넘으면 20장씩). 행사 다녀온 날처럼 많이 올릴 때는
// '촬영 시각으로 나누기'를 켜면 촬영 시각 30분 간격으로 묶음(= 게시물)을 나눈다.
// 묶음마다 내용을 넣고, 공통 설정은 한 번에 적용한 뒤, 차례로 게시한다.
// 사진은 변환하자마자 미리 올려 두므로(업로드 자리) 한 번에 500장까지 다룬다.

type Common = { category: Bundle["category"]; hasPeople: boolean; consent: ConsentInput; tags: Bundle["tags"]; credits: Bundle["credits"] };

const newBundle = (photoIds: string[], common: Common, audience = loadAudienceDefaults()): Bundle => ({
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
  // 지난번 고른 공개 범위 · 댓글 · 촬영 정보 표시를 미리 채운다
  visibility: audience.visibility,
  commentPolicy: audience.commentPolicy,
  scheduledAt: "",
  showExif: audience.showExif,
  veil: null,
  draft: null,
  state: { kind: "edit" },
});

export function UploadStudio({
  viewerHandle,
  currentYear,
  initialTags = [],
}: {
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
  // 촬영 시각으로 여러 게시물로 나누기 (끄면 게시물 하나로)
  const [split, setSplit] = useState(false);

  const photosOf = (bundle: Bundle) => bundle.photoIds.map((id) => photos[id]).filter((p): p is Photo => Boolean(p));
  const pending = bundles.filter((b) => b.state.kind !== "published");
  const sessionCount = pending.reduce((n, b) => n + b.photoIds.length, 0);

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
    if (split) {
      // 새로 넣은 사진끼리 촬영 시각으로 묶어 뒤에 붙인다 (이미 손본 묶음은 건드리지 않음)
      const groups = groupByShootingTime(added);
      setBundles((list) => [...list, ...groups.map((g) => newBundle(g.map((p) => p.id), common))]);
      return;
    }
    // 게시물 하나로: 아직 올리기 전인 마지막 게시물에 이어 담고, 20장이 넘치면 다음 게시물로
    setBundles((list) => {
      const ids = added.map((p) => p.id);
      const last = list.at(-1);
      const open = last && last.draft === null && last.state.kind === "edit" ? last : null;
      const room = open ? Math.max(0, MAX_PHOTOS_PER_POST - open.photoIds.length) : 0;
      const head = ids.slice(0, room);
      const rest = ids.slice(room);
      const chunks: string[][] = [];
      for (let i = 0; i < rest.length; i += MAX_PHOTOS_PER_POST) chunks.push(rest.slice(i, i + MAX_PHOTOS_PER_POST));
      const kept = open && head.length ? list.map((b) => (b.id === open.id ? { ...b, photoIds: [...b.photoIds, ...head] } : b)) : list;
      return [...kept, ...chunks.map((c) => newBundle(c, common))];
    });
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
    if (bundleProblem(bundle, list)) return false;
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

  const ready = pending.filter((b) => bundleProblem(b, photosOf(b)) === null);
  const hasDrafts = pending.some((b) => b.draft);

  // 지금 단계: 사진 고르기 → 정보 적기 → 게시
  const step = bundles.length === 0 ? 1 : pending.length > 0 && ready.length === pending.length ? 3 : 2;

  return (
    <div className="mt-8 flex flex-col gap-6">
      <ol aria-label="올리기 단계" className="flex flex-wrap items-center gap-2 text-sm">
        {(["사진 고르기", "정보 적기", "게시"] as const).map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true" className="h-px w-6 bg-line" />}
            <span
              aria-current={step === i + 1 ? "step" : undefined}
              className={`flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                step > i + 1 ? "bg-text text-bg" : step === i + 1 ? "bg-accent text-on-accent" : "border border-line text-quiet"
              }`}
            >
              {step > i + 1 ? "✓" : i + 1}
            </span>
            <span className={step === i + 1 ? "font-bold" : "text-quiet"}>{label}</span>
          </li>
        ))}
      </ol>
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
          {split
            ? `촬영 시각이 30분 넘게 떨어지면 다른 게시물로 나눠요 (게시물 하나에 ${MAX_PHOTOS_PER_POST}장까지)`
            : `고른 사진은 게시물 하나로 담겨요 (${MAX_PHOTOS_PER_POST}장이 넘으면 다음 게시물로)`}
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
      {/* 행사 다녀온 날처럼 많이 올릴 때만: 촬영 시각으로 나누기 (이미 만든 게시물은 그대로) */}
      <label className="flex min-h-11 items-start gap-2.5 text-sm">
        <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} className="mt-0.5 size-5 accent-[var(--accent)]" />
        <span>
          촬영 시각으로 여러 게시물로 나누기
          <span className="block text-xs text-quiet">행사 · 출사처럼 하루에 여러 장면을 찍었을 때. 다음에 고르는 사진부터 적용돼요.</span>
        </span>
      </label>
      {notice && <p className="text-xs text-quiet">{notice}</p>}

      {pending.length > 1 && (
        <details className="rounded-2xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold">공통 설정 · 모든 묶음에 한 번에 적용</summary>
          <div className="mt-4 flex flex-col gap-4">
            <TagPicker value={common.tags} onChange={(tags) => setCommon((c) => ({ ...c, tags }))} disabled={false} />
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

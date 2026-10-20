"use client";

import { useLeaveWarning } from "@/lib/ui/use-details-dismiss";
import { loadAudienceDefaults } from "./audience-defaults";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ShareButton } from "@/components/share-button";
import { groupByShootingTime, timeRange } from "@/lib/photos/grouping";
import { MAX_PHOTOS_PER_POST } from "@/lib/photos/post-input";
import { type Category, peopleByDefault } from "@/lib/photos/write-defaults";
import { type Bundle, BundleCard, bundleProblem, effectiveYear, emptyConsent, titleFor } from "./bundle-card";
import { discardDraft, discardUploadSlots } from "./actions";
import { clearDraft, DRAFT_DAYS, loadDraft, type SavedPhoto, saveDraft, type UploadDraft } from "./draft-store";
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
  const { photos, addFiles, release, retry, restore } = useConverter({ stage: true });
  // 이어서 올리기: 이 기기에 저장해 둔 지난번 내용 (계정마다 따로)
  const draftKey = `upload:${viewerHandle ?? "me"}`;
  const [resume, setResume] = useState<UploadDraft | null>(null);
  // 전체 진행 · 남은 시간 (사진을 고른 때부터)
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
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
    // 새로 고르면 지난번 내용은 이어 쓰지 않는다 (미리 올린 사진은 3일 뒤 자동 정리)
    setResume(null);
    if (startedAt === null || Object.values(photos).every((p) => p.status === "ready")) setStartedAt(Date.now());
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
      // 게시 완료 화면에 쓸 대표 사진은 따로 남긴다 (변환본은 아래에서 놓는다)
      const cover = list[0]?.thumb ? URL.createObjectURL(list[0].thumb) : undefined;
      update(bundle.id, { state: { kind: "published", postId, cover } });
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
    void clearDraft(draftKey);
  }

  // 지난번 내용 불러오기 (처음 한 번)
  useEffect(() => {
    let alive = true;
    void loadDraft(draftKey).then((d) => alive && d && setResume(d));
    return () => {
      alive = false;
    };
  }, [draftKey]);

  // 적은 내용 · 준비가 끝난 사진을 이 기기에 저장 (잠깐 멈췄을 때)
  useEffect(() => {
    if (resume) return;
    const timer = setTimeout(async () => {
      const open = bundles.filter((b) => b.state.kind !== "published");
      const ids = open.flatMap((b) => b.photoIds);
      const readyPhotos = ids.map((id) => photos[id]).filter((p): p is Photo => p?.status === "ready" && Boolean(p.slotId));
      if (readyPhotos.length === 0) {
        if (bundles.length === 0 || open.length === 0) void clearDraft(draftKey);
        return;
      }
      const readyIds = new Set(readyPhotos.map((p) => p.id));
      const saved: SavedPhoto[] = [];
      for (const p of readyPhotos) {
        // 미리보기 주소(blob:)는 다시 열면 쓸 수 없어 그림(thumb)으로 따로 저장한다
        const { preview, thumb, ...rest } = p;
        void preview;
        saved.push({ ...rest, thumb: thumb ?? null });
      }
      await saveDraft(draftKey, {
        savedAt: new Date().toISOString(),
        category,
        bundles: open.map((b) => ({ ...b, photoIds: b.photoIds.filter((id) => readyIds.has(id)), state: { kind: "edit" } as const })).filter((b) => b.photoIds.length > 0),
        photos: saved,
        missing: ids.length - readyPhotos.length,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [bundles, photos, resume, draftKey, category]);

  function resumeDraft(d: UploadDraft) {
    const back = new Set(restore(d.photos.map(({ thumb, ...photo }) => ({ photo, thumb }))));
    const next = d.bundles.map((b) => ({ ...b, photoIds: b.photoIds.filter((id) => back.has(id)) })).filter((b) => b.photoIds.length > 0);
    setBundles(next);
    setCurrent(0);
    setResume(null);
    if (d.missing > 0) setNotice(`준비가 끝나지 않았던 사진 ${d.missing}장은 다시 골라 주세요.`);
  }

  async function discardResume(d: UploadDraft) {
    setResume(null);
    void discardUploadSlots(d.photos.flatMap((p) => (p.slotId ? [p.slotId] : [])));
    for (const b of d.bundles) if (b.draft) await discardDraft({ postId: b.draft.postId });
    await clearDraft(draftKey);
  }

  // 다 게시했으면 저장해 둔 내용은 지운다
  const allPublished = bundles.length > 0 && bundles.every((b) => b.state.kind === "published");
  useEffect(() => {
    if (allPublished) void clearDraft(draftKey);
  }, [allPublished, draftKey]);

  // 전체 진행: 준비 중인 사진이 있을 때만 시계를 돌린다 (남은 시간 계산)
  const openPhotos = bundles.filter((b) => b.state.kind !== "published").flatMap(photosOf);
  const readyCount = openPhotos.filter((p) => p.status === "ready").length;
  const preparing = openPhotos.some((p) => p.status === "converting" || p.status === "uploading");
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, [preparing]);

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

      {resume && bundles.length === 0 && <ResumeCard draft={resume} onResume={() => resumeDraft(resume)} onDiscard={() => void discardResume(resume)} />}

      {preparing && <ProgressLine photos={openPhotos} readyCount={readyCount} startedAt={startedAt} now={now} />}

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
            {resume ? "새로 사진 고르기" : "사진 고르기"}
            <span className="hidden md:inline"> · 끌어다 놓아도 돼요</span>
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

      {!allDone && bundles.length > 1 && (
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

      {shown && !allDone && (
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
        <DoneScreen
          bundles={bundles}
          viewerHandle={viewerHandle}
          onMore={() => {
            setBundles([]);
            setCurrent(0);
            document.getElementById(inputId)?.click();
          }}
        />
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

const savedFormat = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

/** 지난번 올리던 내용 (이 기기에 3일) */
function ResumeCard({ draft, onResume, onDiscard }: { draft: UploadDraft; onResume(): void; onDiscard(): void }) {
  const first = draft.bundles[0];
  const thumbs = draft.photos.slice(0, 4).flatMap((p) => (p.thumb ? [{ id: p.id, url: URL.createObjectURL(p.thumb) }] : []));
  const facts = [
    `사진 ${draft.photos.length}장`,
    first?.title ? `제목 '${first.title}'` : null,
    first?.tags.length ? `태그 ${first.tags.length}` : null,
    first?.hasPeople && first.consent.subjectLabel ? "동의 기록 있음" : null,
    draft.bundles.length > 1 ? `게시물 ${draft.bundles.length}개` : null,
  ].filter(Boolean);
  return (
    <section aria-label="올리던 사진" className="flex flex-col gap-3 rounded-2xl border border-accent bg-accent-soft/40 p-4">
      <p className="font-semibold">올리던 사진이 있어요</p>
      <p className="text-xs text-quiet">
        {savedFormat.format(new Date(draft.savedAt))} · {facts.join(" · ")}
      </p>
      {thumbs.length > 0 && (
        <ul className="grid max-w-sm grid-cols-4 gap-1.5">
          {thumbs.map((t, i) => (
            <li key={t.id} className="relative aspect-square overflow-hidden rounded-lg bg-slot">
              {/* 이 기기에 저장해 둔 미리보기(blob:) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url} alt="" className="size-full object-cover" />
              {i === 3 && draft.photos.length > 4 && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-bold text-white">+{draft.photos.length - 3}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onResume} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-on-accent">
          이어서 올리기
        </button>
        <button type="button" onClick={onDiscard} className="min-h-11 text-sm text-quiet underline underline-offset-4">
          지우고 새로 시작
        </button>
      </div>
      <p className="text-xs text-quiet">이 기기에서만 기억해요 · {DRAFT_DAYS}일이 지나면 저절로 지워져요</p>
    </section>
  );
}

/** 전체 진행 한 줄: 준비 중 17 / 25 · 약 1분 남음 */
function ProgressLine({ photos, readyCount, startedAt, now }: { photos: Photo[]; readyCount: number; startedAt: number | null; now: number }) {
  const total = photos.length;
  const uploading = photos.filter((p) => p.status === "uploading").length;
  const converting = photos.filter((p) => p.status === "converting").length;
  const failed = photos.filter((p) => p.status === "error").length;
  const elapsed = startedAt && now > startedAt ? now - startedAt : 0;
  const left = readyCount >= 2 && elapsed > 0 ? ((elapsed / readyCount) * (total - readyCount - failed)) / 1000 : null;
  const eta = left === null ? null : left < 60 ? "1분 안" : `약 ${Math.round(left / 60)}분`;
  const pct = (n: number) => `${(n / Math.max(total, 1)) * 100}%`;
  return (
    <div role="status" className="flex flex-col gap-1.5 rounded-xl bg-surface px-3.5 py-2.5 text-sm">
      <p className="flex items-baseline justify-between gap-2">
        <strong>
          사진 준비 중 · {readyCount} / {total}
        </strong>
        {eta && <span className="text-xs text-quiet">{eta} 남음</span>}
      </p>
      <div aria-hidden="true" className="flex h-1.5 overflow-hidden rounded-full bg-line">
        <span className="bg-emerald-500" style={{ width: pct(readyCount) }} />
        <span className="bg-accent" style={{ width: pct(uploading) }} />
      </div>
      <p className="text-xs text-quiet">
        준비됨 {readyCount} · 올리는 중 {uploading} · 기다림 {converting}
        {failed > 0 && ` · 다시 시도 필요 ${failed}`} — 기다리는 동안 계속 적어도 돼요
      </p>
    </div>
  );
}

/** 게시 완료: 대표 사진 · 카카오톡으로 보내기 · 함께한 사람 안내 · 글 보기 · 더 올리기 */
function DoneScreen({ bundles, viewerHandle, onMore }: { bundles: Bundle[]; viewerHandle: string | null; onMore(): void }) {
  const done = bundles.flatMap((b) => (b.state.kind === "published" ? [{ bundle: b, postId: b.state.postId, cover: b.state.cover }] : []));
  const first = done[0];
  if (!first) return null;
  const others = [...new Set(done.flatMap((d) => d.bundle.credits.flatMap((c) => (c.kind === "member" && c.handle !== viewerHandle ? [`@${c.handle}`] : []))))];
  return (
    <section aria-labelledby="done-heading" className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <h2 id="done-heading" className="text-xl font-bold">
        {done.length > 1 ? `${done.length}개 게시했어요` : "게시했어요"}
      </h2>
      <ul className="flex flex-col gap-4">
        {done.map((d, i) => (
          <li key={d.postId} className="flex flex-col gap-2">
            {d.cover && (
              // 이 기기에서 만든 미리보기(blob:)
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.cover} alt="" className={`w-full rounded-2xl bg-slot object-cover ${i === 0 && done.length === 1 ? "aspect-[4/3]" : "aspect-[3/1]"}`} />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <strong className="min-w-0 flex-1 truncate">{d.bundle.title || "제목 없는 글"}</strong>
              <ShareButton path={`/p/${d.postId}`} title={d.bundle.title} />
              <Link href={`/p/${d.postId}`} className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm hover:border-quiet">
                글 보기
              </Link>
            </div>
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <p className="rounded-xl border border-line px-4 py-3 text-sm">
          <strong>함께한 사람에게 알림이 갔어요</strong>
          <span className="block text-xs text-quiet">{others.join(" · ")} — 승인하면 그분 프로필에도 보여요</span>
        </p>
      )}
      <button type="button" onClick={onMore} className="min-h-12 rounded-xl border border-line font-semibold hover:border-quiet">
        사진 더 올리기
      </button>
    </section>
  );
}

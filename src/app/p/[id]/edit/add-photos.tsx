"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { uploadPhotoFiles } from "@/app/upload/publish-bundle";
import { ACCEPT_INPUT, type Photo, useConverter } from "@/app/upload/use-converter";
import { addPhotos, finishPhotos } from "./photo-actions";

type Stage = { kind: "idle" } | { kind: "uploading"; sent: number; total: number } | { kind: "finishing" } | { kind: "error"; message: string };

/**
 * 게시된 글에 사진 더하기. 변환은 업로드 화면과 같다 (브라우저에서 AVIF · JPEG, EXIF 제거, 워터마크).
 * 행 만들기 → 파일 올리기 → 서버가 파일 확인 후 공개. 중간에 실패한 사진은 다른 사람에게 보이지 않고 하루 뒤 정리된다.
 */
export function AddPhotos({ postId, room }: { postId: string; room: number }) {
  const router = useRouter();
  const { photos, addFiles, release } = useConverter();
  const [ids, setIds] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [rawConfirmed, setRawConfirmed] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const list = ids.map((id) => photos[id]).filter((p): p is Photo => Boolean(p));
  const busy = stage.kind === "uploading" || stage.kind === "finishing";
  const converting = list.some((p) => p.status === "converting");
  const hasRaw = list.some((p) => p.raw);
  const ready = list.length > 0 && list.every((p) => p.status === "ready") && (!hasRaw || rawConfirmed);

  // 변환 · 업로드 중에 창을 닫으면 작업이 끊긴다
  useEffect(() => {
    if (!busy && !converting) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy, converting]);

  async function upload() {
    setStage({ kind: "uploading", sent: 0, total: list.length * 5 });
    try {
      const created = await addPhotos({
        postId,
        photos: list.map((p) => ({
          width: p.result!.width,
          height: p.result!.height,
          bytes: p.result!.files["4000"].size,
          takenAt: p.takenAt,
          watermarkSeed: p.result!.seed,
          phash: p.result!.phash,
          exif: p.exif ?? null,
        })),
      });
      if (!created.ok) throw new Error(created.error);
      await uploadPhotoFiles(created.data.photoIds, list, (sent, total) => setStage({ kind: "uploading", sent, total }));
      setStage({ kind: "finishing" });
      const finished = await finishPhotos({ postId, photoIds: created.data.photoIds });
      if (!finished.ok) throw new Error(finished.error);
      release(ids);
      setIds([]);
      setRawConfirmed(false);
      setStage({ kind: "idle" });
      router.refresh();
    } catch (error) {
      setStage({ kind: "error", message: error instanceof Error ? error.message : "사진을 더하지 못했어요." });
    }
  }

  return (
    <section aria-labelledby="add-photos-heading" className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <h2 id="add-photos-heading" className="text-sm font-semibold">
        사진 더하기 <span className="font-normal text-quiet">(앞으로 {Math.max(room - ids.length, 0)}장 더 넣을 수 있어요)</span>
      </h2>

      {list.length > 0 && (
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {list.map((p) => (
            <li key={p.id} className="relative aspect-square overflow-hidden rounded-lg bg-slot">
              {p.preview && (
                // eslint-disable-next-line @next/next/no-img-element -- 브라우저에서 만든 미리보기(blob:)
                <img src={p.preview} alt="" draggable={false} className="size-full object-cover" />
              )}
              {p.status === "converting" && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[11px] text-white">
                  변환 {Math.round(p.progress * 100)}%
                </span>
              )}
              {p.status === "error" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/70 p-1 text-center text-[11px] text-red-200">{p.error}</span>
              )}
              {!busy && (
                <button
                  type="button"
                  onClick={() => {
                    release([p.id]);
                    setIds((all) => all.filter((x) => x !== p.id));
                  }}
                  aria-label="이 사진 빼기"
                  className="absolute top-1 right-1 size-7 rounded-full bg-black/60 text-sm text-white"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasRaw && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={rawConfirmed} disabled={busy} onChange={(e) => setRawConfirmed(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          RAW 사진은 보정 전 원본임을 확인했어요
        </label>
      )}

      {notice && <p className="text-xs text-quiet">{notice}</p>}
      {stage.kind === "error" && (
        <p role="alert" className="text-sm text-red-300">
          {stage.message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-sm ${busy || ids.length >= room ? "pointer-events-none opacity-40" : "hover:border-quiet"}`}>
          사진 고르기
          <input
            type="file"
            accept={ACCEPT_INPUT}
            multiple
            disabled={busy || ids.length >= room}
            className="sr-only"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              const { added, skipped } = await addFiles(files, room - ids.length);
              setIds((all) => [...all, ...added.map((p) => p.id)]);
              setNotice(skipped.length ? skipped.join(" · ") : null);
              if (stage.kind === "error") setStage({ kind: "idle" });
            }}
          />
        </label>
        {list.length > 0 && (
          <button
            type="button"
            disabled={!ready || busy}
            onClick={upload}
            className="min-h-11 rounded-xl bg-accent px-5 text-sm font-semibold text-on-accent disabled:opacity-50"
          >
            {stage.kind === "uploading"
              ? `올리는 중 ${stage.total ? Math.round((stage.sent / stage.total) * 100) : 0}%`
              : stage.kind === "finishing"
                ? "확인하는 중…"
                : converting
                  ? "변환하는 중…"
                  : `${list.length}장 올리기`}
          </button>
        )}
      </div>
    </section>
  );
}

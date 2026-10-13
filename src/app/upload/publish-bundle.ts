"use client";

import type { CreditInput } from "@/lib/photos/credit-input";
import type { ConsentInput } from "@/lib/photos/post-input";
import { VARIANT_NAMES, VARIANTS } from "@/lib/photos/variants";
import { createDraft, publishPost } from "./actions";
import type { Photo } from "./use-converter";

// 묶음 하나(= 게시물 하나)를 올린다: 초안 만들기 → 변환본 올리기 → 게시.
// 중간에 실패하면 만들어 둔 초안으로 다시 시도한다(같은 사진을 두 번 만들지 않음).

const UPLOAD_CONCURRENCY = 3;

export type BundleMeta = {
  title: string;
  body: string;
  category: "cosplay" | "model" | "landscape" | "other";
  hasPeople: boolean;
  shotYear: number;
  shotOn: string | null;
  consent: ConsentInput;
  tagIds: string[];
  credits: CreditInput[];
};

export type Draft = { postId: string; photoIds: string[] };

export async function publishBundle(
  meta: BundleMeta,
  photos: Photo[],
  draft: Draft | null,
  hooks: { onDraft(draft: Draft): void; onProgress(sent: number, total: number): void; onPublishing(): void },
): Promise<string> {
  let current = draft;
  if (!current) {
    const created = await createDraft({
      title: meta.title,
      body: meta.body,
      category: meta.category,
      shotYear: meta.shotYear,
      shotOn: meta.shotOn,
      hasPeople: meta.hasPeople,
      tagIds: meta.tagIds,
      credits: meta.credits,
      photos: photos.map((p) => ({
        width: p.result!.width,
        height: p.result!.height,
        bytes: p.result!.files["4000"].size,
        takenAt: p.takenAt,
        watermarkSeed: p.result!.seed,
      })),
    });
    if (!created.ok) throw new Error(created.error);
    current = created.data;
    hooks.onDraft(current);
  }

  await uploadPhotoFiles(current.photoIds, photos, hooks.onProgress);

  hooks.onPublishing();
  const published = await publishPost({ postId: current.postId }, meta.hasPeople ? meta.consent : null);
  if (!published.ok) throw new Error(published.error);
  return current.postId;
}

/**
 * 변환본을 /api/photos 로 올린다 (동시에 3개, 일시 오류는 두 번 더 시도).
 * photoIds[i]가 photos[i]의 사진 행이다. 업로드 화면 · 게시물 편집(사진 추가) 공용.
 */
export async function uploadPhotoFiles(
  photoIds: string[],
  photos: Photo[],
  onProgress: (sent: number, total: number) => void,
): Promise<void> {
  const jobs = photos.flatMap((photo, index) =>
    VARIANT_NAMES.map((name) => ({ photoId: photoIds[index]!, name, blob: photo.result!.files[name] })),
  );
  let sent = 0;
  onProgress(sent, jobs.length);

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
    onProgress(++sent, jobs.length);
  };

  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: UPLOAD_CONCURRENCY }, async () => {
      for (let job = queue.shift(); job; job = queue.shift()) await put(job);
    }),
  );
}

/** EXIF 촬영 시각을 이 기기 시간대의 날짜로 (EXIF에는 시간대가 없다) */
export function localDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

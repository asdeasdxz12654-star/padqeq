"use client";

import exifr from "exifr";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_INPUT_BYTES } from "@/lib/photos/post-input";
import type { VariantName } from "@/lib/photos/variants";
import type { ConvertMessage, ConvertRequest } from "./convert.worker";
import { RAW_EXTENSIONS } from "@/lib/photos/raw-preview";
import { decodeRaw, isMobileDevice, RAW_MAX_BYTES_DESKTOP, RAW_MAX_BYTES_MOBILE, type RawMethod } from "./raw-decoder";
import { findSimilarPhotos } from "./tag-actions";
import { discardUploadSlots, reserveUploadSlot } from "./actions";
import { uploadPhotoFiles } from "./publish-bundle";
import { dayLightFromExif } from "@/lib/photos/day-light";
import { EXIF_TAGS, type ExifInfo, exifInfo } from "@/lib/photos/exif-info";

// 사진 변환 상태 관리. 변환은 작업 스레드에서 한 장씩 차례로 한다.
// 대량 업로드(stage)에서는 변환이 끝난 사진을 바로 업로드 자리에 올리고 큰 변환본을 메모리에서 놓는다.
// 올리기를 기다리는 사진이 쌓이면 다음 변환을 잠시 멈춘다 (휴대폰 메모리 보호).

// HEIC는 Windows · 안드로이드에서 MIME이 비어 오기도 해 확장자도 함께 본다.
// RAW(CR2 · CR3 · NEF · ARW · RAF · RW2 · ORF · DNG)는 MIME이 제각각이라 확장자로만 판단한다.
export const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];
const ACCEPT_EXTENSIONS = /\.(jpe?g|png|webp|avif|heic|heif)$/i;
const isRaw = (file: File) => RAW_EXTENSIONS.test(file.name);
const isAccepted = (file: File) =>
  isRaw(file) || ACCEPT.includes(file.type) || (file.type === "" && ACCEPT_EXTENSIONS.test(file.name));
export const ACCEPT_INPUT = [...ACCEPT, ".heic", ".heif", ".cr2", ".cr3", ".nef", ".arw", ".raf", ".rw2", ".orf", ".dng"].join(",");

/** 업로드 화면에서 한 번에 다룰 수 있는 사진 수 (변환하자마자 올리므로 메모리와 상관없다, DB도 500자리까지) */
export const MAX_SESSION_PHOTOS = 500;

/** 변환은 끝났지만 아직 올리지 못한 사진이 이만큼이면 다음 변환을 기다린다 */
const MAX_WAITING_UPLOADS = 3;

type Result = { width: number; height: number; seed: string; phash: string; color: string; bytes: number; files: Record<VariantName, Blob> | null };

export type Photo = {
  id: string;
  name: string;
  takenAt: string | null;
  /** converting: 변환 대기 · 변환 중 → uploading: 미리 올리는 중(대량 업로드) → ready */
  status: "converting" | "uploading" | "ready" | "error";
  /** RAW에서 만든 사진: 해석 방식 (내장 미리보기 · 전체 현상 · 작은 미리보기) */
  raw?: { method: RawMethod | "pending" };
  progress: number;
  error?: string;
  preview?: string;
  /** files는 미리 올리고 나면 놓는다 (null) */
  result?: Result;
  /** 미리 올려 둔 업로드 자리 (대량 업로드) */
  slotId?: string;
  /** 올리기에 실패했지만 변환본이 남아 있어 다시 시도할 수 있다 */
  retryable?: boolean;
  /** 촬영 정보 (장비 · 설정) */
  exif?: ExifInfo | null;
  /** 이미 올린 내 사진과 비슷하면 그 글 id (경고만, 올릴 수는 있다) */
  similarPostId?: string;
};

export function useConverter({ stage = false }: { stage?: boolean } = {}) {
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const urls = useRef(new Set<string>());
  // 변환 대기열 · 지금 변환 중인지 · 올리기를 기다리는 수
  const queue = useRef<{ photo: Photo; file: File }[]>([]);
  const converting = useRef(false);
  const waiting = useRef(0);
  const pump = useRef<() => void>(() => undefined);
  // 미리 올린 자리(사진 id → 자리 id) · 도중에 뺀 사진 · 올리기에 실패해 다시 시도할 변환본
  const slots = useRef(new Map<string, string>());
  const removed = useRef(new Set<string>());
  const failed = useRef(new Map<string, Result>());

  const patch = useCallback((id: string, change: Partial<Photo>) => {
    setPhotos((all) => (all[id] ? { ...all, [id]: { ...all[id]!, ...change } } : all));
  }, []);

  /** 변환본을 업로드 자리에 올린다 (대량 업로드) */
  const stageUpload = useCallback(
    async (id: string, result: Result) => {
      waiting.current++;
      patch(id, { status: "uploading", progress: 0, retryable: false, error: undefined });
      try {
        const reserved = await reserveUploadSlot({ width: result.width, height: result.height, bytes: result.bytes });
        if (!reserved.ok) throw new Error(reserved.error);
        const { slotId } = reserved.data;
        if (!removed.current.has(id)) {
          await uploadPhotoFiles([slotId], [result.files!], (sent, total) => patch(id, { progress: sent / total }));
        }
        // 올리는 사이에 뺀 사진이면 자리를 바로 지운다
        if (removed.current.has(id)) {
          void discardUploadSlots([slotId]);
          return;
        }
        slots.current.set(id, slotId);
        failed.current.delete(id);
        // 올렸으니 큰 변환본은 놓는다 (미리보기는 화면에 쓰므로 남는다)
        patch(id, { status: "ready", progress: 1, slotId, result: { ...result, files: null } });
      } catch (error) {
        failed.current.set(id, result);
        patch(id, { status: "error", error: error instanceof Error ? error.message : "사진을 준비하지 못했어요", retryable: true });
      } finally {
        waiting.current--;
        pump.current();
      }
    },
    [patch],
  );

  useEffect(() => {
    const w = new Worker(new URL("./convert.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (event: MessageEvent<ConvertMessage>) => {
      const m = event.data;
      if (m.type === "progress") {
        patch(m.id, { progress: m.done / m.total });
        return;
      }
      converting.current = false;
      const gone = removed.current.has(m.id);
      if (m.type === "error") patch(m.id, { status: "error", error: m.message });
      else if (!gone) {
        const result: Result = { width: m.width, height: m.height, seed: m.seed, phash: m.phash, color: m.color, bytes: m.files["4000"].size, files: m.files };
        const preview = URL.createObjectURL(m.files["400"]);
        urls.current.add(preview);
        patch(m.id, { status: stage ? "uploading" : "ready", progress: stage ? 0 : 1, preview, result });
        if (stage) void stageUpload(m.id, result);
        void findSimilarPhotos([m.phash]).then(([postId]) => {
          if (postId) patch(m.id, { similarPostId: postId });
        });
      }
      pump.current();
    };

    // 다음 사진 변환 (한 번에 한 장, 올리기를 기다리는 사진이 많으면 멈춤)
    pump.current = () => {
      if (converting.current || (stage && waiting.current >= MAX_WAITING_UPLOADS)) return;
      const next = queue.current.shift();
      if (!next) return;
      const { photo, file } = next;
      converting.current = true;
      if (!photo.raw) {
        w.postMessage({ id: photo.id, file } satisfies ConvertRequest);
        return;
      }
      // RAW는 화면 쪽에서 해석한 뒤(메모리 보호) 그림을 변환 스레드로 넘긴다
      void decodeRaw(file)
        .then((decoded) => {
          setPhotos((all) =>
            all[photo.id]
              ? {
                  ...all,
                  [photo.id]: { ...all[photo.id]!, raw: { method: decoded.method }, takenAt: all[photo.id]!.takenAt ?? decoded.takenAt },
                }
              : all,
          );
          w.postMessage({ id: photo.id, bitmap: decoded.bitmap } satisfies ConvertRequest, [decoded.bitmap]);
        })
        .catch((error: unknown) => {
          converting.current = false;
          patch(photo.id, { status: "error", error: error instanceof Error ? error.message : "RAW를 읽지 못했어요" });
          pump.current();
        });
    };
    // 이전 작업 스레드에서 멈춘 대기열을 이어 간다 (개발 모드 재실행)
    converting.current = false;
    pump.current();

    const created = urls.current;
    const leftovers = slots.current;
    return () => {
      w.terminate();
      created.forEach((url) => URL.revokeObjectURL(url));
      // 화면을 떠나면 게시하지 않은 자리를 정리한다 (못 지운 것은 3일 뒤 자동 정리)
      if (leftovers.size) void discardUploadSlots([...leftovers.values()]);
      leftovers.clear();
    };
  }, [stage, stageUpload, patch]);

  /** 파일을 받아 변환 대기열에 넣고, 받아들인 사진 목록과 건너뛴 이유를 돌려준다 */
  const addFiles = useCallback(async (files: File[], room: number): Promise<{ added: Photo[]; skipped: string[] }> => {
    const skipped: string[] = [];
    const candidates: File[] = [];
    for (const file of files) {
      const raw = isRaw(file);
      const rawLimit = isMobileDevice() ? RAW_MAX_BYTES_MOBILE : RAW_MAX_BYTES_DESKTOP;
      if (!isAccepted(file)) skipped.push(`${file.name} (지원하지 않는 형식)`);
      else if (raw && file.size > rawLimit) skipped.push(`${file.name} (RAW ${rawLimit / 1024 / 1024}MB 초과)`);
      else if (!raw && file.size > MAX_INPUT_BYTES) skipped.push(`${file.name} (50MB 초과)`);
      else if (candidates.length >= room) skipped.push(`${file.name} (한 번에 ${room}장까지)`);
      else candidates.push(file);
    }
    // 촬영 시각 · 촬영 정보는 파일 앞부분만 읽으므로 몇 장씩 함께 읽는다
    const accepted: { photo: Photo; file: File }[] = [];
    for (let i = 0; i < candidates.length; i += 8) {
      const batch = candidates.slice(i, i + 8);
      const infos = await Promise.all(batch.map(async (file) => ({ takenAt: await readTakenAt(file), exif: await readExifInfo(file) })));
      batch.forEach((file, j) =>
        accepted.push({
          file,
          photo: {
            id: crypto.randomUUID(),
            name: file.name,
            // RAW의 촬영 시각은 해석하면서 읽는다 (CR3 등은 미리보기 EXIF에서)
            takenAt: infos[j]!.takenAt,
            exif: infos[j]!.exif,
            status: "converting",
            progress: 0,
            ...(isRaw(file) && { raw: { method: "pending" as const } }),
          },
        }),
      );
    }
    if (accepted.length) {
      setPhotos((all) => ({ ...all, ...Object.fromEntries(accepted.map(({ photo }) => [photo.id, photo])) }));
      queue.current.push(...accepted);
      pump.current();
    }
    return { added: accepted.map((a) => a.photo), skipped };
  }, []);

  /** 올리기에 실패한 사진 다시 올리기 (대량 업로드) */
  const retry = useCallback(
    (id: string) => {
      const result = failed.current.get(id);
      if (result) void stageUpload(id, result);
    },
    [stageUpload],
  );

  /** 게시를 마쳤거나 뺀 사진의 변환본을 놓아 메모리를 비운다. 게시하지 않고 뺀 사진의 자리는 지운다. */
  const release = useCallback((ids: string[], { published = false }: { published?: boolean } = {}) => {
    const wanted = new Set(ids);
    queue.current = queue.current.filter((q) => !wanted.has(q.photo.id));
    const unused: string[] = [];
    for (const id of ids) {
      removed.current.add(id);
      failed.current.delete(id);
      const slot = slots.current.get(id);
      if (slot && !published) unused.push(slot);
      slots.current.delete(id);
    }
    if (unused.length) void discardUploadSlots(unused);
    setPhotos((all) => {
      const next = { ...all };
      for (const id of ids) {
        const preview = next[id]?.preview;
        if (preview) {
          URL.revokeObjectURL(preview);
          urls.current.delete(preview);
        }
        delete next[id];
      }
      return next;
    });
  }, []);

  return { photos, addFiles, release, retry };
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

/** 촬영 정보 (장비 · 설정 + 하루의 빛, 위치는 읽지 않는다) */
async function readExifInfo(file: File): Promise<ExifInfo | null> {
  try {
    const raw = await exifr.parse(file, [...EXIF_TAGS, "DateTimeOriginal", "OffsetTimeOriginal"]);
    const info = exifInfo(raw);
    const light = dayLightFromExif(raw?.DateTimeOriginal, raw?.OffsetTimeOriginal);
    return light ? { ...info, light } : info;
  } catch {
    return null;
  }
}

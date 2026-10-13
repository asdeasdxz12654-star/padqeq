"use client";

import exifr from "exifr";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_INPUT_BYTES } from "@/lib/photos/post-input";
import type { VariantName } from "@/lib/photos/variants";
import type { ConvertMessage, ConvertRequest } from "./convert.worker";

// 사진 변환 상태 관리. 변환은 작업 스레드에서 한 장씩 차례로 한다.

// HEIC는 Windows · 안드로이드에서 MIME이 비어 오기도 해 확장자도 함께 본다. RAW는 다음 단계.
export const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/heic", "image/heif"];
const ACCEPT_EXTENSIONS = /\.(jpe?g|png|webp|avif|heic|heif)$/i;
const isAccepted = (file: File) => ACCEPT.includes(file.type) || (file.type === "" && ACCEPT_EXTENSIONS.test(file.name));

/** 한 번에 다룰 수 있는 사진 수 (변환본을 게시 전까지 메모리에 들고 있으므로) */
export const MAX_SESSION_PHOTOS = 100;

export type Photo = {
  id: string;
  name: string;
  takenAt: string | null;
  status: "converting" | "ready" | "error";
  progress: number;
  error?: string;
  preview?: string;
  result?: { width: number; height: number; seed: string; files: Record<VariantName, Blob> };
};

export function useConverter() {
  const worker = useRef<Worker | null>(null);
  const [photos, setPhotos] = useState<Record<string, Photo>>({});
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const w = new Worker(new URL("./convert.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (event: MessageEvent<ConvertMessage>) => {
      const m = event.data;
      setPhotos((all) => {
        const photo = all[m.id];
        if (!photo) return all; // 이미 뺀 사진
        if (m.type === "progress") return { ...all, [m.id]: { ...photo, progress: m.done / m.total } };
        if (m.type === "error") return { ...all, [m.id]: { ...photo, status: "error", error: m.message } };
        const preview = URL.createObjectURL(m.files["400"]);
        urls.current.add(preview);
        return {
          ...all,
          [m.id]: {
            ...photo,
            status: "ready",
            progress: 1,
            preview,
            result: { width: m.width, height: m.height, seed: m.seed, files: m.files },
          },
        };
      });
    };
    worker.current = w;
    const created = urls.current;
    return () => {
      w.terminate();
      created.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  /** 파일을 받아 변환을 시작하고, 받아들인 사진 목록과 건너뛴 이유를 돌려준다 */
  const addFiles = useCallback(
    async (files: File[], room: number): Promise<{ added: Photo[]; skipped: string[] }> => {
      const skipped: string[] = [];
      const accepted: { photo: Photo; file: File }[] = [];
      for (const file of files) {
        if (!isAccepted(file)) skipped.push(`${file.name} (지원하지 않는 형식 · RAW는 곧 지원)`);
        else if (file.size > MAX_INPUT_BYTES) skipped.push(`${file.name} (50MB 초과)`);
        else if (accepted.length >= room) skipped.push(`${file.name} (한 번에 ${MAX_SESSION_PHOTOS}장까지)`);
        else {
          accepted.push({
            file,
            photo: { id: crypto.randomUUID(), name: file.name, takenAt: await readTakenAt(file), status: "converting", progress: 0 },
          });
        }
      }
      if (accepted.length) {
        setPhotos((all) => ({ ...all, ...Object.fromEntries(accepted.map(({ photo }) => [photo.id, photo])) }));
        for (const { photo, file } of accepted) worker.current?.postMessage({ id: photo.id, file } satisfies ConvertRequest);
      }
      return { added: accepted.map((a) => a.photo), skipped };
    },
    [],
  );

  /** 게시를 마쳤거나 뺀 사진의 변환본을 놓아 메모리를 비운다 */
  const release = useCallback((ids: string[]) => {
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

  return { photos, addFiles, release };
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

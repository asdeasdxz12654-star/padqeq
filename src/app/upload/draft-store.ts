"use client";

import type { Bundle } from "./bundle-card";
import type { Photo } from "./use-converter";

// 이어서 올리기 (캔버스 45 ①): 올리던 내용을 이 기기(IndexedDB)에만 저장한다. 서버에 새 표는 없다.
// 준비가 끝난 사진만 남긴다: 파일은 이미 서버의 업로드 자리에 있고(3일 보관), 여기에는 작은 미리보기와 사진 정보만 둔다.

export const DRAFT_DAYS = 3;
const DB = "haedam-upload";
const STORE = "drafts";

/** 저장하는 사진: 미리보기는 주소 대신 그림(Blob) 그대로 */
export type SavedPhoto = Omit<Photo, "preview" | "thumb"> & { thumb: Blob | null };

export type UploadDraft = {
  savedAt: string;
  category: Bundle["category"];
  bundles: Bundle[];
  photos: SavedPhoto[];
  /** 저장할 때 아직 준비가 끝나지 않아 빠진 사진 수 (이어서 올릴 때 다시 골라 달라고) */
  missing: number;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, job: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = job(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** 저장된 내용 (없거나 3일이 지났거나 읽을 수 없으면 null) */
export async function loadDraft(key: string): Promise<UploadDraft | null> {
  try {
    const draft = (await run("readonly", (s) => s.get(key))) as UploadDraft | undefined;
    if (!draft || Date.now() - Date.parse(draft.savedAt) > DRAFT_DAYS * 86_400_000 || draft.photos.length === 0) return null;
    return draft;
  } catch {
    return null;
  }
}

export async function saveDraft(key: string, draft: UploadDraft): Promise<void> {
  try {
    await run("readwrite", (s) => s.put(draft, key));
  } catch {
    // 저장 공간이 없거나 사생활 보호 모드면 조용히 넘어간다 (올리기는 그대로 된다)
  }
}

export async function clearDraft(key: string): Promise<void> {
  try {
    await run("readwrite", (s) => s.delete(key));
  } catch {
    // 위와 같다
  }
}

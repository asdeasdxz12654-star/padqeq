import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// 사진 변환본 저장소.
//  · 배포(Workers): R2 바인딩 PHOTOS (공개 주소 없는 버킷)
//  · 로컬 개발(`next dev`): 이 PC의 .data/r2 폴더 (워커 런타임 없이 업로드 흐름을 시험)

export type StoredObject = { body: ReadableStream; size: number; etag: string };

export interface PhotoStore {
  put(key: string, body: ArrayBuffer, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  exists(key: string): Promise<boolean>;
}

// R2 바인딩에서 쓰는 부분만 (타입은 워커 설정에서 생성되므로 여기서는 최소 형태로)
type R2Like = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream; size: number; httpEtag: string } | null>;
  head(key: string): Promise<unknown | null>;
};

const SAFE_KEY = /^display\/[0-9a-f]{32}\/(4000|2560|1200|400)\.avif$|^display\/[0-9a-f]{32}\/1600\.jpg$/;

function assertKey(key: string) {
  if (!SAFE_KEY.test(key)) throw new Error(`허용되지 않은 저장 경로: ${key}`);
}

export async function photoStore(): Promise<PhotoStore> {
  let bucket: R2Like | undefined;
  try {
    const { env } = await getCloudflareContext({ async: true });
    bucket = (env as { PHOTOS?: R2Like }).PHOTOS;
  } catch {
    // next dev (워커 런타임 없음)
  }
  if (bucket) return r2Store(bucket);
  if (process.env.NODE_ENV === "development") return diskStore();
  throw new Error("사진 저장소(PHOTOS)가 연결되지 않았습니다");
}

function r2Store(bucket: R2Like): PhotoStore {
  return {
    async put(key, body, contentType) {
      assertKey(key);
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },
    async get(key) {
      assertKey(key);
      const object = await bucket.get(key);
      return object ? { body: object.body, size: object.size, etag: object.httpEtag } : null;
    },
    async exists(key) {
      assertKey(key);
      return (await bucket.head(key)) !== null;
    },
  };
}

function diskStore(): PhotoStore {
  const root = async () => {
    const { join } = await import("node:path");
    return join(process.cwd(), ".data", "r2");
  };
  return {
    async put(key, body) {
      assertKey(key);
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { dirname, join } = await import("node:path");
      const file = join(await root(), key);
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, new Uint8Array(body));
    },
    async get(key) {
      assertKey(key);
      const { readFile, stat } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const file = join(await root(), key);
      try {
        const info = await stat(file);
        const data = await readFile(file);
        return {
          body: new Blob([data]).stream(),
          size: info.size,
          etag: `"${info.size}-${info.mtimeMs}"`,
        };
      } catch {
        return null;
      }
    },
    async exists(key) {
      assertKey(key);
      const { access } = await import("node:fs/promises");
      const { join } = await import("node:path");
      return access(join(await root(), key)).then(
        () => true,
        () => false,
      );
    },
  };
}

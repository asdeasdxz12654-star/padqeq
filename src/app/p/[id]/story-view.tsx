"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import type { ViewerPhoto } from "@/lib/posts/get-post";
import { refreshPhotoSources } from "./actions";
import { decode, paint } from "./canvas-paint";

// 이야기 보기: 여러 장을 옆으로 넘기는 대신 촬영 순서대로 세로로 이어 보기 (전시 도록처럼).
// 넘겨 보기와 같이 canvas에 그리고 보는 사람 표시를 새긴다. 화면 가까이 온 사진만 받는다.

const MAX_HEIGHT = 0.86;

/** 넘겨 보기 ↔ 이어 보기 (3장 이상일 때만 고를 수 있다) */
export function StageSwitch({ count, single, story }: { count: number; single: ReactNode; story: ReactNode }) {
  const [mode, setMode] = useState<"single" | "story">("single");
  if (count < 3) return single;
  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="보기 방식" className="mx-auto flex w-fit gap-1 rounded-full border border-line p-1 text-sm">
        {(["single", "story"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className="min-h-9 rounded-full px-4 text-quiet aria-pressed:bg-text aria-pressed:font-semibold aria-pressed:text-bg"
          >
            {m === "single" ? "넘겨 보기" : "이어 보기"}
          </button>
        ))}
      </div>
      {mode === "single" ? single : story}
    </div>
  );
}

export function StoryView({
  postId,
  initialPhotos,
  watermark,
  memos,
}: {
  postId: string;
  initialPhotos: ViewerPhoto[];
  watermark: string | null;
  memos: { n: number; memo: string }[];
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const refreshed = useRef(false);
  const memoOf = new Map(memos.map((m) => [m.n, m.memo]));
  const count = photos.length;

  // 서명 주소가 만료됐으면 한 번만 새로 받는다
  const refresh = async () => {
    if (refreshed.current) return false;
    refreshed.current = true;
    const fresh = await refreshPhotoSources(postId);
    if (fresh?.length) setPhotos(fresh);
    return Boolean(fresh?.length);
  };

  return (
    <ol aria-label="사진 이어 보기" className="flex flex-col gap-10 md:gap-14">
      {photos.map((p, i) => (
        <li key={p.id} className="flex flex-col items-center gap-3">
          <StoryPhoto photo={p} watermark={watermark} onExpired={refresh} />
          <p className="flex max-w-xl items-baseline gap-3 px-4 text-sm leading-relaxed text-quiet">
            <span className="shrink-0 font-mono text-xs tabular-nums">
              {String(i + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
            {memoOf.get(i + 1) && <span className="whitespace-pre-line text-text">{memoOf.get(i + 1)}</span>}
          </p>
        </li>
      ))}
    </ol>
  );
}

function StoryPhoto({ photo, watermark, onExpired }: { photo: ViewerPhoto; watermark: string | null; onExpired: () => Promise<boolean> }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // 화면 가까이 오면 받기 시작
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => entry?.isIntersecting && setNear(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 그릴 크기: 칸 너비와 화면 높이에 맞춘다
  useEffect(() => {
    const el = holder.current?.parentElement;
    if (!el) return;
    const measure = () => {
      const ratio = photo.width / photo.height;
      const width = Math.min(el.clientWidth, Math.round(window.innerHeight * MAX_HEIGHT * ratio), photo.width);
      setSize({ width, height: Math.round(width / ratio) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [photo.width, photo.height]);

  useEffect(() => {
    if (!near || !size) return;
    let cancelled = false;
    const needed = size.width * Math.min(window.devicePixelRatio || 1, 3);
    const source = photo.sources.avif.find((s) => s.width >= needed) ?? photo.sources.avif.at(-1)!;
    decode(source.url)
      .catch(() => decode(photo.sources.jpeg))
      .then((bitmap) => {
        if (cancelled || !canvas.current) return bitmap.close();
        paint(canvas.current, bitmap, size.width, size.height, watermark);
        bitmap.close();
        setStatus("ready");
      })
      .catch(async () => {
        if (cancelled) return;
        if (!(await onExpired())) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [near, size, photo, watermark, onExpired]);

  return (
    <div
      ref={holder}
      data-photo
      className="photo-guard relative shrink-0 rounded-lg bg-slot"
      style={size ? { width: size.width, height: size.height } : { aspectRatio: `${photo.width} / ${photo.height}`, width: "100%" }}
    >
      <canvas ref={canvas} role="img" aria-label={photo.alt} className={`block size-full rounded-lg ${status === "ready" ? "develop-canvas" : "invisible"}`} />
      {status === "error" && <p className="absolute inset-0 flex items-center justify-center text-sm text-quiet">사진을 불러오지 못했어요</p>}
    </div>
  );
}

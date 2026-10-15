"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DOUBLE_LIKE_EVENT, isDoubleTap, type Tap } from "@/lib/posts/double-tap";
import type { ViewerPhoto } from "@/lib/posts/get-post";
import { refreshPhotoSources } from "./actions";

// 상세 사진 뷰어 (S-06 · P-02).
//  · 사진을 <img>가 아닌 canvas에 그린다 → 길게 눌러 저장 · 다른 이름으로 저장할 이미지 파일이 없다
//  · 로그인 회원에게는 보는 사람의 @핸들을 사진에 옅게 새긴다 (유출 추적)
//  · 화면 너비 × 화소 밀도에 맞는 크기만 받는다 (1200 · 2560, 구형 기기는 JPEG)
//  · ← → 키, 좌우로 밀기, 이전 · 다음 버튼
//  · 두 번 톡(마우스는 더블클릭) → 좋아요 (취소는 버튼으로만)

const MAX_CACHE = 6;

type Status = "loading" | "ready" | "error";

const noop = () => () => {};

export function PhotoViewer({
  postId,
  initialPhotos,
  watermark,
  canLike = false,
}: {
  postId: string;
  initialPhotos: ViewerPhoto[];
  watermark: string | null;
  /** 두 번 탭으로 좋아요 (로그인 회원 · 게시된 글) */
  canLike?: boolean;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [index, setIndex] = useState(0);
  // 마지막으로 그린 결과. 지금 보여야 할 사진 · 크기와 같을 때만 유효하다.
  const [painted, setPainted] = useState<{ key: string; ok: boolean } | null>(null);
  const [box, setBox] = useState<{ width: number; maxHeight: number } | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  // 전체화면 (P-04): 지원하는 브라우저에서만 버튼을 보인다 (아이폰 Safari는 요소 전체화면을 지원하지 않음)
  const canFullscreen = useSyncExternalStore(noop, () => Boolean(document.fullscreenEnabled), () => false);
  const [full, setFull] = useState(false);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmaps = useRef(new Map<string, Promise<ImageBitmap>>());
  const refreshed = useRef(false);
  const [retry, setRetry] = useState(0);

  const photo = photos[index]!;
  const count = photos.length;
  const go = useCallback((delta: number) => setIndex((i) => Math.min(count - 1, Math.max(0, i + delta))), [count]);

  // 보이는 영역 크기
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    // 전체화면이면 화면을 거의 다 쓴다
    const measure = () =>
      setBox({ width: el.clientWidth, maxHeight: Math.round(window.innerHeight * (document.fullscreenElement ? 0.9 : 0.78)) });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  // 키보드
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && document.fullscreenEnabled) toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, toggleFullscreen]);

  // 화면에 그릴 크기 (CSS px). 파노라마는 높이에 맞추고 좌우로 민다.
  const display = box ? fit(photo, box) : null;
  const paintKey = display ? `${photo.id}:${display.width}x${display.height}:${retry}` : null;
  const status: Status = painted && painted.key === paintKey ? (painted.ok ? "ready" : "error") : "loading";

  const load = useCallback(
    (target: ViewerPhoto, cssWidth: number): Promise<ImageBitmap> => {
      const needed = cssWidth * Math.min(window.devicePixelRatio || 1, 3);
      const source = target.sources.avif.find((s) => s.width >= needed) ?? target.sources.avif.at(-1)!;
      const key = `${target.id}:${source.width}`;
      let pending = bitmaps.current.get(key);
      if (!pending) {
        pending = decode(source.url).catch(() => decode(target.sources.jpeg));
        pending.catch(() => bitmaps.current.delete(key));
        bitmaps.current.set(key, pending);
        // 오래된 것부터 정리
        while (bitmaps.current.size > MAX_CACHE) {
          const [oldest, value] = bitmaps.current.entries().next().value!;
          bitmaps.current.delete(oldest);
          void value.then((b) => b.close()).catch(() => undefined);
        }
      }
      return pending;
    },
    [],
  );

  // 현재 사진 그리기 + 이웃 사진 미리 받기
  useEffect(() => {
    if (!display || !paintKey) return;
    let cancelled = false;
    load(photo, display.width)
      .then((bitmap) => {
        if (cancelled || !canvas.current) return;
        paint(canvas.current, bitmap, display.width, display.height, watermark);
        setPainted({ key: paintKey, ok: true });
      })
      .catch(async () => {
        if (cancelled) return;
        // 서명 주소가 만료됐을 수 있다 → 한 번만 새 주소를 받아 다시 시도
        if (!refreshed.current) {
          refreshed.current = true;
          const fresh = await refreshPhotoSources(postId);
          if (!cancelled && fresh?.length) {
            bitmaps.current.clear();
            setPhotos(fresh);
            setRetry((n) => n + 1);
            return;
          }
        }
        if (!cancelled) setPainted({ key: paintKey, ok: false });
      });
    for (const neighbor of [photos[index + 1], photos[index - 1]]) {
      if (neighbor && box) void load(neighbor, fit(neighbor, box).width).catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [paintKey]); // eslint-disable-line react-hooks/exhaustive-deps -- paintKey가 사진 · 크기 · 재시도를 모두 담는다

  // 좌우로 밀기
  const swipe = useRef<number | null>(null);

  // 두 번 탭 → 좋아요 + 하트
  const lastTap = useRef<Tap | null>(null);
  const pointerType = useRef("mouse");
  const [burst, setBurst] = useState(0);
  const likeByTap = useCallback(() => {
    window.dispatchEvent(new CustomEvent(DOUBLE_LIKE_EVENT, { detail: { postId } }));
    setBurst((n) => n + 1);
  }, [postId]);
  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(0), 800);
    return () => clearTimeout(timer);
  }, [burst]);

  return (
    <div ref={root} className={`flex flex-col gap-3 ${full ? "h-full justify-center bg-black p-4" : ""}`}>
      <div
        ref={frame}
        className={`photo-guard relative flex touch-manipulation justify-center ${photo.isPanorama ? "overflow-x-auto" : "overflow-hidden"}`}
        onPointerDown={(e) => {
          pointerType.current = e.pointerType;
          if (e.pointerType !== "mouse") swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (canLike && e.pointerType !== "mouse") {
            const tap = { time: e.timeStamp, x: e.clientX, y: e.clientY };
            if (isDoubleTap(lastTap.current, tap)) {
              lastTap.current = null;
              likeByTap();
            } else lastTap.current = tap;
          }
          if (swipe.current === null || photo.isPanorama) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
        onDoubleClick={() => {
          // 터치는 위에서 처리했다 (일부 브라우저는 두 번 탭에도 dblclick을 보낸다)
          if (canLike && pointerType.current === "mouse") likeByTap();
        }}
      >
        <div
          className="relative shrink-0 rounded-lg bg-slot"
          style={display ? { width: display.width, height: display.height } : { aspectRatio: `${photo.width} / ${photo.height}`, width: "100%" }}
        >
          <canvas
            ref={canvas}
            role="img"
            aria-label={photo.alt}
            className={`block size-full rounded-lg ${status === "ready" ? "" : "invisible"}`}
          />
          {burst > 0 && (
            <svg
              key={burst}
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="like-burst pointer-events-none absolute top-1/2 left-1/2 size-24 text-white drop-shadow-lg"
              fill="currentColor"
            >
              <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
            </svg>
          )}
          {status === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-quiet">
              사진을 불러오지 못했어요
              <button
                type="button"
                onClick={() => {
                  refreshed.current = false;
                  setRetry((n) => n + 1);
                }}
                className="rounded-full border border-line px-3 py-1 text-text"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>
      </div>

      {(count > 1 || canFullscreen) && (
        <div className="flex items-center justify-center gap-4 text-sm">
          {count > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="이전 사진"
            className="min-h-11 min-w-11 rounded-full border border-line disabled:opacity-30"
          >
            ‹
          </button>
          )}
          {count > 1 && (
          <span aria-live="polite" className="tabular-nums text-quiet">
            {index + 1} / {count}
          </span>
          )}
          {count > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            disabled={index === count - 1}
            aria-label="다음 사진"
            className="min-h-11 min-w-11 rounded-full border border-line disabled:opacity-30"
          >
            ›
          </button>
          )}
          {canFullscreen && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={full ? "전체화면 끝내기" : "전체화면 (F)"}
              title={full ? "전체화면 끝내기" : "전체화면 (F)"}
              className="min-h-11 min-w-11 rounded-full border border-line px-3 text-xs"
            >
              {full ? "닫기" : "전체화면"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function fit(photo: ViewerPhoto, box: { width: number; maxHeight: number }) {
  const ratio = photo.width / photo.height;
  if (photo.isPanorama) {
    const height = Math.min(box.maxHeight, photo.height, Math.round(box.width / 2));
    return { width: Math.round(height * ratio), height };
  }
  const width = Math.min(box.width, Math.round(box.maxHeight * ratio), photo.width);
  return { width, height: Math.round(width / ratio) };
}

async function decode(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { credentials: "same-origin", cache: "default" });
  if (!response.ok) throw new Error(String(response.status));
  return createImageBitmap(await response.blob());
}

function paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap, cssWidth: number, cssHeight: number, mark: string | null) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (!mark) return;

  // 보는 사람 표시: 사진을 해치지 않을 만큼 옅게, 비스듬히 반복
  ctx.save();
  const size = Math.max(12, Math.round(13 * dpr));
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.05)";
  ctx.lineWidth = Math.max(1, dpr * 0.6);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-Math.PI / 7);
  const stepX = size * (mark.length * 0.75 + 6);
  const stepY = size * 7;
  const reach = Math.hypot(canvas.width, canvas.height);
  for (let y = -reach; y < reach; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -reach; x < reach; x += stepX) {
      ctx.strokeText(mark, x + offset, y);
      ctx.fillText(mark, x + offset, y);
    }
  }
  ctx.restore();
}

"use client";

import { useEffect, useRef, useState } from "react";

/** 잘라낼 정사각형 (원본 픽셀) */
export type AvatarCrop = { x: number; y: number; side: number };

const VIEW = 256;
const MAX_ZOOM = 4;

// 회원 시안 46 ⑤: 프로필 사진 위치 · 크기 — 끌어서 위치, 아래 막대(− +)로 크기. 원 안이 프로필 사진이 된다.
/** src: 고른 파일의 blob: 주소 (만들고 지우는 것은 부르는 쪽이) */
export function AvatarCropper({
  src,
  onDone,
  onCancel,
  onFail,
}: {
  src: string;
  onDone(crop: AvatarCrop): void;
  onCancel(): void;
  onFail(): void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    from: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const scale = size ? (VIEW / Math.min(size.w, size.h)) * zoom : 1;
  // 원 밖으로 빈 곳이 보이지 않게 가둔다
  const clamp = (p: { x: number; y: number }, s = scale) =>
    size
      ? {
          x: Math.min(0, Math.max(VIEW - size.w * s, p.x)),
          y: Math.min(0, Math.max(VIEW - size.h * s, p.y)),
        }
      : p;

  const zoomTo = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    if (!size) return;
    const base = VIEW / Math.min(size.w, size.h);
    // 가운데를 기준으로 키운다
    const cx = (VIEW / 2 - pos.x) / scale;
    const cy = (VIEW / 2 - pos.y) / scale;
    const s = base * z;
    setZoom(z);
    setPos(clamp({ x: VIEW / 2 - cx * s, y: VIEW / 2 - cy * s }, s));
  };

  const done = () => {
    if (!size) return;
    const side = Math.min(size.w, size.h, VIEW / scale);
    onDone({
      x: Math.max(0, -pos.x / scale),
      y: Math.max(0, -pos.y / scale),
      side,
    });
  };

  return (
    <dialog
      ref={dialog}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="avatar-crop-title"
      className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-bg p-5 text-text backdrop:bg-black/60"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 id="avatar-crop-title" className="font-semibold">
          프로필 사진
        </h2>
        <button
          type="button"
          onClick={done}
          disabled={!size}
          className="min-h-10 px-2 font-semibold text-accent disabled:opacity-50"
        >
          완료
        </button>
      </div>
      <div
        className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-xl bg-slot select-none active:cursor-grabbing"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            from: pos,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d?.id !== e.pointerId) return;
          setPos(
            clamp({
              x: d.from.x + e.clientX - d.x,
              y: d.from.y + e.clientY - d.y,
            }),
          );
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => zoomTo(zoom - e.deltaY / 500)}
      >
        {
          // eslint-disable-next-line @next/next/no-img-element -- 고른 파일 미리보기 (blob:)
          <img
            src={src}
            alt=""
            draggable={false}
            onError={onFail}
            onLoad={(e) => {
              const w = e.currentTarget.naturalWidth;
              const h = e.currentTarget.naturalHeight;
              const s = VIEW / Math.min(w, h);
              setSize({ w, h });
              setPos({ x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 });
            }}
            className="pointer-events-none absolute top-0 left-0 max-w-none origin-top-left"
            style={
              size
                ? {
                    width: size.w * scale,
                    height: size.h * scale,
                    transform: `translate(${pos.x}px, ${pos.y}px)`,
                  }
                : { opacity: 0 }
            }
          />
        }
        {/* 원 밖은 어둡게 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(0_0_0/0.45)]"
        />
      </div>
      <p className="mt-3 text-center text-xs text-quiet">
        끌어서 위치를 맞추고, 아래로 크기를 맞춰요
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          aria-label="작게"
          onClick={() => zoomTo(zoom - 0.25)}
          className="size-10 rounded-full border border-line text-lg"
        >
          −
        </button>
        <input
          type="range"
          aria-label="크기"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={(e) => zoomTo(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--accent)]"
        />
        <button
          type="button"
          aria-label="크게"
          onClick={() => zoomTo(zoom + 0.25)}
          className="size-10 rounded-full border border-line text-lg"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="mt-3 min-h-11 w-full text-sm text-quiet"
      >
        취소
      </button>
    </dialog>
  );
}

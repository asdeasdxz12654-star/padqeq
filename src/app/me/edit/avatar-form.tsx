"use client";

import { useRef, useState, useTransition } from "react";
import { AVATAR_SIZE, avatarUrl } from "@/lib/profiles/avatar";

/**
 * 프로필 사진: 빈 원을 눌러 고른다. 올리지 않으면 빈 원 그대로.
 * 고른 사진은 이 브라우저에서 정사각형으로 잘라 256px AVIF로 바꿔 올린다 (서버가 다시 확인한다).
 */
export function AvatarForm({ initial }: { initial: string | null }) {
  const [key, setKey] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const url = avatarUrl(key);

  const pick = async (file: File) => {
    setMessage(null);
    let body: Uint8Array;
    try {
      body = await toAvatarAvif(file);
    } catch {
      setMessage({ ok: false, text: "이 사진은 쓸 수 없어요. 다른 사진으로 해 보세요." });
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/avatar", { method: "PUT", body: new Blob([body as BlobPart]) });
      const data = (await res.json().catch(() => null)) as { key?: string; error?: string } | null;
      if (!res.ok || !data?.key) {
        setMessage({ ok: false, text: data?.error ?? "올리지 못했어요." });
        return;
      }
      setKey(data.key);
      setMessage({ ok: true, text: "프로필 사진을 바꿨어요." });
    });
  };

  const remove = () =>
    startTransition(async () => {
      const res = await fetch("/api/avatar", { method: "DELETE" });
      if (!res.ok) {
        setMessage({ ok: false, text: "내리지 못했어요." });
        return;
      }
      setKey(null);
      setMessage({ ok: true, text: "프로필 사진을 내렸어요." });
    });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label={key ? "프로필 사진 바꾸기" : "프로필 사진 고르기"}
        className="size-20 shrink-0 cursor-pointer overflow-hidden rounded-full border border-line bg-slot"
      >
        {url ? (
          // 내 사진이라 이미지 게이트를 거치지 않는다 (next/image도 쓰지 않는 앱 규칙)
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" width={AVATAR_SIZE} height={AVATAR_SIZE} className="size-full object-cover" />
        ) : (
          <span aria-hidden="true" className="flex size-full items-center justify-center text-xs text-quiet">
            사진 고르기
          </span>
        )}
      </button>

      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm font-semibold hover:border-quiet"
          >
            {busy ? "바꾸는 중…" : key ? "사진 바꾸기" : "사진 고르기"}
          </button>
          {key && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex min-h-10 items-center rounded-full border border-line px-4 text-sm text-quiet hover:border-quiet hover:text-text"
            >
              내리기
            </button>
          )}
        </div>
        <p role="status" className={`text-sm ${message ? (message.ok ? "text-ok" : "text-danger") : "text-quiet"}`}>
          {message?.text ?? "가운데를 기준으로 정사각형으로 잘려요."}
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void pick(file);
        }}
      />
    </div>
  );
}

/** 고른 사진을 가운데 기준 정사각형으로 잘라 256px AVIF로 */
async function toAvatarAvif(file: File): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(AVATAR_SIZE, AVATAR_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("그릴 수 없어요");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const { encodeAvif } = await import("@/app/upload/avif-encoder");
  return encodeAvif(ctx.getImageData(0, 0, AVATAR_SIZE, AVATAR_SIZE), { quality: 65, speed: 7 });
}

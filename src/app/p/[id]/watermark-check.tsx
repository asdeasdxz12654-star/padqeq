"use client";

import { useState, useTransition } from "react";
import { decodeHeif, isHeif } from "@/app/upload/heif-decoder";
import { detectWatermark, MATCH_THRESHOLD, seedFromHex } from "@/lib/photos/watermark";
import { getWatermarkSeeds } from "./actions";

// 운영자 전용: 다른 곳에서 발견한 사진이 이 게시물의 사진인지 보이지 않는 워터마크로 확인한다.
// 사진은 이 브라우저 안에서만 읽고 서버로 보내지 않는다.

const MAX_EDGE = 2000;

type Row = { position: number; score: number; ratioOff: boolean };

export function WatermarkCheck({ postId }: { postId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check(file: File) {
    setRows(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const seeds = await getWatermarkSeeds(postId);
        if (!seeds?.length) {
          setMessage("이 게시물에는 워터마크 열쇠가 없어요 (워터마크 도입 전 업로드).");
          return;
        }
        const bitmap = await createImageBitmap(file).catch(async (error: unknown) => {
          if (await isHeif(file)) return decodeHeif(file);
          throw error;
        });
        const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();
        const pixels = ctx.getImageData(0, 0, width, height);
        const ratio = width / height;
        setRows(
          seeds.map((s) => ({
            position: s.position,
            score: detectWatermark(pixels, seedFromHex(s.seed)),
            // 잘라낸 사진은 격자가 어긋나 판정이 약해진다
            ratioOff: Math.abs(ratio / (s.width / s.height) - 1) > 0.02,
          })),
        );
      } catch {
        setMessage("사진을 읽지 못했어요. JPEG · PNG · WebP · AVIF · HEIC 파일을 넣어 주세요.");
      }
    });
  }

  const best = rows?.reduce<Row | null>((a, b) => (!a || b.score > a.score ? b : a), null);

  return (
    <details className="border-t border-line pt-4 text-sm">
      <summary className="cursor-pointer text-quiet">운영자 · 워터마크 확인</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-quiet">
          다른 곳에서 발견한 사진을 넣으면 이 게시물의 사진인지 확인해요. 사진은 서버로 보내지 않아요.
        </p>
        <input
          type="file"
          accept="image/*,.heic,.heif"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) check(file);
            e.target.value = "";
          }}
          className="text-xs"
        />
        {pending && <p className="text-xs text-quiet">확인 중…</p>}
        {message && <p className="text-xs text-quiet">{message}</p>}
        {rows && best && (
          <div className="flex flex-col gap-1.5">
            <p className={best.score >= MATCH_THRESHOLD ? "font-semibold text-ok" : "text-quiet"}>
              {best.score >= MATCH_THRESHOLD
                ? `${best.position + 1}번째 사진과 일치해요 (강도 ${best.score.toFixed(1)})`
                : "이 게시물의 워터마크를 찾지 못했어요."}
            </p>
            {best.score < MATCH_THRESHOLD && best.ratioOff && (
              <p className="text-xs text-quiet">가로세로 비율이 달라요. 잘라낸 사진이면 찾지 못할 수 있어요.</p>
            )}
            <ul className="text-xs tabular-nums text-quiet">
              {rows.map((r) => (
                <li key={r.position}>
                  {r.position + 1}번째: {r.score.toFixed(1)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-quiet">기준 {MATCH_THRESHOLD} 이상이면 일치. 관계없는 사진은 보통 ±3 안이에요.</p>
          </div>
        )}
      </div>
    </details>
  );
}

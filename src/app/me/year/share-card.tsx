"use client";

import { useEffect, useState } from "react";
import type { shareCardContent } from "@/lib/review/year-review";

type Content = ReturnType<typeof shareCardContent>;

// 연말 결산 공유 카드 (S-09). 숫자 · 막대 · 분야 · 태그만 그린다 — 사진은 넣지 않는다 (다운로드 금지 원칙).
// 서버를 거치지 않고 이 기기에서 그린다. 휴대폰은 공유 시트로, 아니면 이미지로 저장.

const W = 1080;
const H = 1350;
const COLOR = { bg: "#111110", line: "#2a2a27", text: "#f2f2ee", quiet: "#a3a39c", accent: "#6b9bff", slot: "#22221f" };

export function YearShareCard({ year, handle, content }: { year: number; handle: string; content: Content }) {
  const [card, setCard] = useState<{ url: string; file: File } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => {
    if (card) URL.revokeObjectURL(card.url);
  }, [card]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      await document.fonts?.ready;
      const blob = await draw(year, handle, content, getComputedStyle(document.body).fontFamily);
      const file = new File([blob], `haedam-${year}.png`, { type: "image/png" });
      setCard({ url: URL.createObjectURL(blob), file });
    } catch {
      setError("카드를 만들지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!card) return;
    try {
      await navigator.share({ files: [card.file], title: `나의 ${year} · 해담` });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError("공유하지 못했어요. 이미지로 저장해 주세요.");
    }
  };

  const canShareFile = card !== null && typeof navigator !== "undefined" && Boolean(navigator.canShare?.({ files: [card.file] }));

  return (
    <section aria-labelledby="share-card-heading" className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <h2 id="share-card-heading" className="text-lg font-semibold">
        공유 카드
      </h2>
      <p className="text-sm text-quiet">올해의 숫자만 담은 카드예요. 사진과 함께한 사람의 이름은 들어가지 않아요.</p>
      {card ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- 이 기기에서 만든 blob 이미지 */}
          <img src={card.url} alt={`나의 ${year} 공유 카드`} width={W} height={H} className="mx-auto h-auto w-full max-w-xs rounded-lg border border-line" />
          <div className="flex flex-wrap gap-2">
            {canShareFile && (
              <button type="button" onClick={share} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">
                공유하기
              </button>
            )}
            <a
              href={card.url}
              download={card.file.name}
              className={`inline-flex min-h-11 items-center rounded-xl px-4 text-sm ${canShareFile ? "border border-line" : "bg-accent font-semibold text-on-accent"}`}
            >
              이미지로 저장
            </a>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={make}
          disabled={busy}
          className="min-h-11 self-start rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "카드 만들기"}
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </section>
  );
}

async function draw(year: number, handle: string, content: Content, family: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const font = (weight: number, size: number) => `${weight} ${size}px ${family}`;
  const pad = 88;

  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // 머리: 해담 · @핸들
  ctx.fillStyle = COLOR.quiet;
  ctx.font = font(600, 34);
  ctx.fillText("해담", pad, 130);
  ctx.textAlign = "right";
  ctx.fillText(`@${handle}`, W - pad, 130);
  ctx.textAlign = "left";

  ctx.fillStyle = COLOR.text;
  ctx.font = font(800, 124);
  ctx.fillText(`나의 ${year}`, pad, 290);

  // 숫자 3개
  const colW = (W - pad * 2) / 3;
  content.stats.forEach((s, i) => {
    const x = pad + colW * i;
    ctx.fillStyle = COLOR.text;
    ctx.font = font(800, 92);
    ctx.fillText(s.value.toLocaleString("ko-KR"), x, 460);
    ctx.fillStyle = COLOR.quiet;
    ctx.font = font(500, 32);
    ctx.fillText(s.label, x, 510);
  });

  // 달마다 막대
  const top = 600;
  const barH = 260;
  const gap = 14;
  const bw = (W - pad * 2 - gap * 11) / 12;
  content.bars.forEach((b, i) => {
    const x = pad + i * (bw + gap);
    const h = Math.max(b.ratio * barH, 8);
    ctx.fillStyle = b.count ? COLOR.accent : COLOR.slot;
    roundTop(ctx, x, top + barH - h, bw, h, 8);
    ctx.fillStyle = COLOR.quiet;
    ctx.font = font(500, 26);
    ctx.textAlign = "center";
    ctx.fillText(String(b.month), x + bw / 2, top + barH + 42);
    ctx.textAlign = "left";
  });

  let y = top + barH + 120;
  if (content.busiest) {
    ctx.fillStyle = COLOR.text;
    ctx.font = font(600, 40);
    ctx.fillText(content.busiest, pad, y);
    y += 80;
  }

  // 분야 · 태그 (한 줄에 다 들어가지 않으면 자른다)
  for (const row of [content.categories, content.tags]) {
    if (!row.length) continue;
    let x = pad;
    ctx.font = font(500, 34);
    for (const label of row) {
      const w = ctx.measureText(label).width + 48;
      if (x + w > W - pad) break;
      ctx.strokeStyle = COLOR.line;
      ctx.lineWidth = 3;
      pill(ctx, x, y - 44, w, 64);
      ctx.fillStyle = COLOR.text;
      ctx.fillText(label, x + 24, y);
      x += w + 16;
    }
    y += 92;
  }

  ctx.fillStyle = COLOR.quiet;
  ctx.font = font(500, 30);
  ctx.fillText("memories.haedam.app", pad, H - 80);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"));
}

// roundRect가 없는 구형 Safari(16 미만)는 각진 모양으로 그린다
function roundTop(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, [r, r, 0, 0]);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, h / 2);
  else ctx.rect(x, y, w, h);
  ctx.stroke();
}

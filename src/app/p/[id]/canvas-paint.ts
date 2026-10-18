// 상세 사진을 canvas에 그리기 (넘겨 보기 · 이어 보기가 함께 쓴다). 이미지 파일을 화면에 두지 않는다.

export async function decode(url: string): Promise<ImageBitmap> {
  const response = await fetch(url, { credentials: "same-origin", cache: "default" });
  if (!response.ok) throw new Error(String(response.status));
  return createImageBitmap(await response.blob());
}

export function paint(canvas: HTMLCanvasElement, bitmap: ImageBitmap, cssWidth: number, cssHeight: number, mark: string | null) {
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

// 촬영 정보 (S-06 ⑧): EXIF에서 장비 · 설정만 골라 보기 좋게 만든다. 위치(GPS)는 읽지도 않는다.

import type { DayLight } from "./day-light";

/** 장비 · 설정 + 하루의 빛 (촬영 시각 자체는 담지 않는다) */
export type ExifInfo = Partial<Record<"camera" | "lens" | "aperture" | "shutter" | "iso" | "focal", string>> & { light?: DayLight };

/** exifr로 읽을 태그 (이것만) */
export const EXIF_TAGS = ["Make", "Model", "LensModel", "FNumber", "ExposureTime", "ISO", "FocalLength"] as const;

type Raw = Partial<{ Make: unknown; Model: unknown; LensModel: unknown; FNumber: unknown; ExposureTime: unknown; ISO: unknown; FocalLength: unknown }>;

const text = (v: unknown) => (typeof v === "string" ? v.replace(/\p{Cc}/gu, "").trim().slice(0, 60) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
const round = (v: number, digits: number) => String(Math.round(v * 10 ** digits) / 10 ** digits);

export function exifInfo(raw: Raw | null | undefined): ExifInfo | null {
  if (!raw) return null;
  const make = text(raw.Make);
  const model = text(raw.Model);
  // 모델 이름에 회사 이름이 이미 있으면 한 번만 (예: "Canon Canon EOS R5" → "Canon EOS R5")
  const camera = model.toLowerCase().startsWith(make.toLowerCase().split(" ")[0] ?? "") ? model : `${make} ${model}`.trim();
  const f = num(raw.FNumber);
  const t = num(raw.ExposureTime);
  const iso = num(raw.ISO);
  const focal = num(raw.FocalLength);
  const info: ExifInfo = {
    ...(camera && { camera: camera.slice(0, 60) }),
    ...(text(raw.LensModel) && { lens: text(raw.LensModel) }),
    ...(f && { aperture: `f/${round(f, 1)}` }),
    ...(t && { shutter: t < 1 ? `1/${Math.round(1 / t)}s` : `${round(t, 1)}s` }),
    ...(iso && { iso: `ISO ${Math.round(iso)}` }),
    ...(focal && { focal: `${Math.round(focal)}mm` }),
  };
  return Object.keys(info).length ? info : null;
}

/** 한 줄로 (카메라 · 렌즈 · 초점거리 · 조리개 · 셔터 · ISO) */
export function exifLine(info: ExifInfo | null | undefined): string | null {
  if (!info) return null;
  const parts = [info.camera, info.lens, info.focal, info.aperture, info.shutter, info.iso].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

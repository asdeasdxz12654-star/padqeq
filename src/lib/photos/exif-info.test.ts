import { describe, expect, it } from "vitest";
import { exifInfo, exifLine } from "./exif-info";

describe("exifInfo", () => {
  it("장비 · 설정만 보기 좋게", () => {
    const info = exifInfo({ Make: "Canon", Model: "Canon EOS R5", LensModel: "RF85mm F1.2 L USM", FNumber: 1.8, ExposureTime: 0.004, ISO: 200, FocalLength: 85 });
    expect(info).toEqual({ camera: "Canon EOS R5", lens: "RF85mm F1.2 L USM", aperture: "f/1.8", shutter: "1/250s", iso: "ISO 200", focal: "85mm" });
    expect(exifLine(info)).toBe("Canon EOS R5 · RF85mm F1.2 L USM · 85mm · f/1.8 · 1/250s · ISO 200");
  });

  it("회사 이름이 모델에 없으면 붙인다 · 긴 노출", () => {
    expect(exifInfo({ Make: "SONY", Model: "ILCE-7M4", ExposureTime: 2 })).toEqual({ camera: "SONY ILCE-7M4", shutter: "2s" });
  });

  it("값이 없으면 null", () => {
    expect(exifInfo({})).toBeNull();
    expect(exifInfo(null)).toBeNull();
    expect(exifLine(null)).toBeNull();
  });
});

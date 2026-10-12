import type { PhotoSources } from "@/lib/photos/server";

// 이미지 게이트를 거치는 사진. 저장 · 끌기 · 길게 눌러 저장을 막고(photo-guard),
// AVIF를 못 여는 구형 기기는 JPEG로 본다.
export function ProtectedPhoto({
  sources,
  alt,
  width,
  height,
  sizes,
  className = "",
  priority = false,
}: {
  sources: PhotoSources;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <picture className="photo-guard block">
      <source type="image/avif" srcSet={sources.avifSrcSet} sizes={sizes} />
      <img
        src={sources.fallback}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        draggable={false}
        referrerPolicy="same-origin"
        className={className}
      />
    </picture>
  );
}

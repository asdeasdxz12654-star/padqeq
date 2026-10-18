import { AVATAR_SIZE, avatarUrl } from "@/lib/profiles/avatar";

/**
 * 프로필 사진. 올리지 않았으면 빈 원으로 둔다 — 이름 첫 글자나 만들어 낸 그림을 넣지 않는다.
 * 내 사진이 아니라 프로필 사진이라 이미지 게이트(서명 · 워터마크)를 거치지 않는다.
 */
export function Avatar({ avatarKey, size = 64, className = "" }: { avatarKey: string | null | undefined; size?: number; className?: string }) {
  const url = avatarUrl(avatarKey);
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={`block shrink-0 overflow-hidden rounded-full border border-line bg-slot ${className}`}
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- 프로필 사진 (이미지 최적화 거치지 않음)
        <img src={url} alt="" width={AVATAR_SIZE} height={AVATAR_SIZE} loading="lazy" decoding="async" className="size-full object-cover" />
      )}
    </span>
  );
}

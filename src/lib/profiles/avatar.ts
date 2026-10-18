// 프로필 사진 (S-09). 올리지 않으면 빈 자리로 둔다.
//  · 저장소 열쇠는 avatars/<회원 id>/<무작위 32자>.avif (DB의 set_my_avatar가 같은 모양을 확인한다)
//  · 사진 게시물과 달리 워터마크 · 서명 게이트를 거치지 않는다. 주소가 곧 파일이라 오래 캐시한다

/** 한 변의 픽셀 (정사각형). 원으로 보이지만 파일은 정사각형으로 저장한다 */
export const AVATAR_SIZE = 256;

const KEY_PATTERN = /^avatars\/[0-9a-f-]{36}\/[0-9a-f]{32}\.avif$/;

/** 새 열쇠. 바꿀 때마다 새로 만들어 예전 주소의 캐시와 섞이지 않게 한다 */
export function avatarKey(userId: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `avatars/${userId}/${hash}.avif`;
}

/** DB에서 읽은 열쇠가 쓸 수 있는 모양인지 (주소에 그대로 넣기 전에 확인한다) */
export function isAvatarKey(key: string | null | undefined): key is string {
  return typeof key === "string" && KEY_PATTERN.test(key);
}

/** 화면에서 쓰는 주소 */
export function avatarUrl(key: string | null | undefined): string | null {
  return isAvatarKey(key) ? `/avatar/${key}` : null;
}

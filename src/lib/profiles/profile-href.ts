/** 프로필 주소 (next.config.ts에서 /u/handle로 연결) */
export function profileHref(handle: string): string {
  return `/@${handle}`;
}

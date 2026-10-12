// 정보 구조: 하단 탭 5개 (화면 기획서 S-00)
export const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/explore", label: "탐색" },
  { href: "/upload", label: "업로드" },
  { href: "/community", label: "커뮤니티" },
  { href: "/me", label: "마이" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

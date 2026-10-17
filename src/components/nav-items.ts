// 정보 구조: 휴대폰 아래 탭 5개 · PC 상단 메뉴 4개 (디자인 개편 v2)
// 행사가 해담의 강점이라 아래 탭에 두고, 커뮤니티는 행사 화면 위 전환([행사 | 커뮤니티])으로 들어간다.
export const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/explore", label: "탐색" },
  { href: "/upload", label: "올리기" },
  { href: "/events", label: "행사" },
  { href: "/me", label: "마이" },
] as const;

/** PC 상단 메뉴 (올리기 · 마이는 오른쪽 버튼으로 따로) */
export const HEADER_NAV = [
  { href: "/", label: "홈" },
  { href: "/explore", label: "탐색" },
  { href: "/events", label: "행사" },
  { href: "/community", label: "커뮤니티" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // 아래 탭 '행사'는 커뮤니티 화면에서도 켜진다 (같은 묶음)
  if (href === "/events" && (pathname === "/community" || pathname.startsWith("/community/"))) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

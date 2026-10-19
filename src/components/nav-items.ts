// 정보 구조: 휴대폰 아래 탭 5개 · PC 상단 메뉴 4개 (2026-10-19)
// 커뮤니티를 아래 탭으로 꺼내고(예전에는 행사 화면 안 전환), 올리기는 아래 탭 위에 떠 있는 버튼으로 (upload-fab.tsx).
export const NAV_ITEMS = [
  { href: "/", label: "홈" },
  { href: "/explore", label: "탐색" },
  { href: "/events", label: "행사" },
  { href: "/community", label: "커뮤니티" },
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
  return pathname === href || pathname.startsWith(`${href}/`);
}

// 미가입 크레딧의 인스타그램 · X(트위터) 아이디 (해담 회원이 아직 적은 초반을 위해, 2026-10-20)
// 저장은 예전처럼 external_url 한 칸에 주소로 하고, 화면에서 주소를 보고 다시 '인스타 @아이디'로 보여 준다.

export const SOCIALS = {
  instagram: { label: "인스타그램", short: "인스타", base: "https://www.instagram.com/", pattern: /^[A-Za-z0-9._]{1,30}$/, hosts: ["instagram.com", "www.instagram.com"] },
  x: { label: "X(트위터)", short: "X", base: "https://x.com/", pattern: /^[A-Za-z0-9_]{1,15}$/, hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"] },
} as const;

export type Social = keyof typeof SOCIALS;
export const SOCIAL_KINDS = Object.keys(SOCIALS) as Social[];

/** 입력한 아이디(@ 있어도 됨) → 프로필 주소. 아이디 모양이 아니면 null */
export function socialUrl(kind: Social, id: string): string | null {
  const clean = id.trim().replace(/^@/, "");
  return SOCIALS[kind].pattern.test(clean) ? SOCIALS[kind].base + clean : null;
}

/** 저장된 주소가 인스타그램 · X 프로필이면 { kind, id } */
export function socialFromUrl(url: string | null | undefined): { kind: Social; id: string } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const id = parsed.pathname.split("/").filter(Boolean);
  if (id.length !== 1) return null;
  for (const kind of SOCIAL_KINDS) {
    const s = SOCIALS[kind];
    if ((s.hosts as readonly string[]).includes(parsed.hostname) && s.pattern.test(id[0])) return { kind, id: id[0] };
  }
  return null;
}

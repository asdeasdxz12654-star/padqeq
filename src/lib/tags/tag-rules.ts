// 태그 이름 · 주소 규칙 (DB 제약 tags_slug_check와 같은 기준)

export const TAG_KINDS = ["work", "character", "event", "place", "general"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const TAG_KIND_LABEL: Record<TagKind, string> = {
  work: "작품",
  character: "캐릭터",
  event: "행사",
  place: "장소",
  general: "일반",
};

export const MAX_TAGS_PER_POST = 10;
export const MAX_TAG_NAME = 60;

/** 표시 이름 정리: 유니코드 정규화 · 제어 문자 제거 · 공백 하나로 */
export function cleanTagName(name: string): string {
  return name.normalize("NFKC").replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim().slice(0, MAX_TAG_NAME);
}

/** 주소용 이름: 소문자 · 공백은 '-' · 주소에서 문제가 되는 문자 제거 (/t/라이덴-쇼군) */
export function tagSlug(name: string): string {
  return cleanTagName(name)
    .toLowerCase()
    .replace(/[/?#%\&+.]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_TAG_NAME);
}

/** 별칭 입력("Raiden Shogun, 雷電将軍")을 나눠 정리. 이름과 같은 것 · 중복은 뺀다 */
export function parseAliases(input: string, name: string): string[] {
  const seen = new Set([cleanTagName(name).toLowerCase()]);
  const out: string[] = [];
  for (const part of input.split(/[,，、\n]/)) {
    const alias = cleanTagName(part);
    const key = alias.toLowerCase();
    if (alias && !seen.has(key)) {
      seen.add(key);
      out.push(alias);
    }
  }
  return out.slice(0, 10);
}

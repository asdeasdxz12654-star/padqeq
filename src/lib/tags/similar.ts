// 태그 관리 (운영): 같은 대상을 가리키는 것 같은 태그 짝 찾기.
// 같은 종류끼리만, 띄어쓰기 · 괄호 · 기호 · 대소문자를 무시하고 비교한다. 별칭도 이름처럼 본다.

export type TagForSimilarity = { id: string; kind: string; name: string; aliases: string[]; posts: number };
export type SimilarPair = { keep: TagForSimilarity; drop: TagForSimilarity; reason: "same" | "contains" | "alias" };

/** 비교용 이름: 소문자, 한글 · 영문 · 숫자만 */
export function normalizeTagName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const MIN_CONTAINED = 3;

/**
 * 비슷한 태그 짝. 남길 쪽(keep)은 게시물이 많은 쪽, 같으면 이름이 짧은 쪽(대표 이름일 가능성이 큼).
 * 한 태그가 여러 짝에 들어갈 수 있다. 정렬: 같은 이름 → 별칭 → 포함, 그 안에서 게시물 합이 많은 순.
 */
export function findSimilarTags(tags: TagForSimilarity[], limit = 100): SimilarPair[] {
  const byKind = new Map<string, { tag: TagForSimilarity; names: string[] }[]>();
  for (const tag of tags) {
    const names = [...new Set([tag.name, ...tag.aliases].map(normalizeTagName).filter(Boolean))];
    const list = byKind.get(tag.kind) ?? [];
    list.push({ tag, names });
    byKind.set(tag.kind, list);
  }

  const pairs: SimilarPair[] = [];
  for (const list of byKind.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const reason = compare(a, b);
        if (reason) pairs.push({ ...order(a.tag, b.tag), reason });
      }
    }
  }
  const rank = { same: 0, alias: 1, contains: 2 } as const;
  return pairs
    .sort((x, y) => rank[x.reason] - rank[y.reason] || y.keep.posts + y.drop.posts - (x.keep.posts + x.drop.posts))
    .slice(0, limit);
}

function compare(a: { tag: TagForSimilarity; names: string[] }, b: { tag: TagForSimilarity; names: string[] }): SimilarPair["reason"] | null {
  const aName = normalizeTagName(a.tag.name);
  const bName = normalizeTagName(b.tag.name);
  if (aName && aName === bName) return "same";
  if (a.names.some((n) => b.names.includes(n))) return "alias";
  // 한쪽 이름(별칭 포함)이 다른 쪽 이름에 통째로 들어 있으면
  for (const x of a.names) {
    for (const y of b.names) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if (short.length >= MIN_CONTAINED && long.includes(short)) return "contains";
    }
  }
  return null;
}

function order(a: TagForSimilarity, b: TagForSimilarity): { keep: TagForSimilarity; drop: TagForSimilarity } {
  if (a.posts !== b.posts) return a.posts > b.posts ? { keep: a, drop: b } : { keep: b, drop: a };
  return a.name.length <= b.name.length ? { keep: a, drop: b } : { keep: b, drop: a };
}

// 태그 관리 (운영): 같은 대상을 가리키는 것 같은 태그 짝 찾기.
// 같은 종류끼리만, 띄어쓰기 · 괄호 · 기호 · 대소문자를 무시하고 비교한다. 별칭도 이름처럼 본다.
// 장소 태그는 이름이 겹치지 않아도 눈에 띄는 낱말이 같거나(엑스코 · 엑스코로) 지도 위치가 가까우면 후보로 본다.

export type TagForSimilarity = {
  id: string;
  kind: string;
  name: string;
  aliases: string[];
  posts: number;
  lat?: number | null;
  lng?: number | null;
};
export type SimilarReason = "same" | "alias" | "contains" | "word" | "near";
export type SimilarPair = { keep: TagForSimilarity; drop: TagForSimilarity; reason: SimilarReason };

/** 비교용 이름: 소문자, 한글 · 영문 · 숫자만 */
export function normalizeTagName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const MIN_CONTAINED = 3;
/** 지도 위치가 이만큼(m) 가까우면 같은 곳일 수 있다 */
export const NEAR_METERS = 200;
const RANK: Record<SimilarReason, number> = { same: 0, alias: 1, contains: 2, word: 3, near: 4 };

// 장소 이름의 낱말 중 어디에나 붙는 것 (같은 곳이라는 근거가 못 된다)
// 행정 구역: '…광역시' 같은 긴 이름, 또는 4자 이하로 시 · 도 · 군 · 구 · 동 · 읍 · 면으로 끝나는 낱말 (부산시 · 해운대구 · 산격동)
const REGION_WORD = /^(?:.+(?:특별시|광역시|특별자치시|특별자치도)|.{1,3}(?:시|도|군|구|동|읍|면))$/u;
const GENERIC_WORDS = new Set([
  "전시장",
  "전시관",
  "전시홀",
  "컨벤션",
  "컨벤션센터",
  "센터",
  "공원",
  "광장",
  "주차장",
  "입구",
  "정문",
  "후문",
  "본관",
  "별관",
  "신관",
  "대학교",
  "체육관",
  "운동장",
  "경기장",
  "공연장",
  "문화회관",
  "기념관",
  "박물관",
  "미술관",
  "스튜디오",
  "카페",
  "hall",
  "center",
  "centre",
  "park",
  "studio",
]);

/**
 * 장소 이름의 눈에 띄는 낱말 (3자 이상). 시 · 구 · 동 같은 행정 구역, 숫자가 든 낱말(10, 1층),
 * 흔한 낱말(전시장 · 공원)은 뺀다. 도로 이름은 '로' · '길'을 떼고 본다 (엑스코로 → 엑스코).
 */
export function placeWords(name: string): string[] {
  const words = name
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !/\p{N}/u.test(w) && !REGION_WORD.test(w))
    .map((w) => (w.length >= 4 ? w.replace(/(번길|로|길)$/u, "") : w))
    .filter((w) => [...w].length >= 3 && !GENERIC_WORDS.has(w));
  return [...new Set(words)];
}

/** 두 위치 사이 거리 (m, 지구를 공으로 보고) */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

type Prepared = { main: string; names: string[]; words: string[]; point: { lat: number; lng: number } | null };

function prepare(tag: Pick<TagForSimilarity, "kind" | "name" | "aliases" | "lat" | "lng">): Prepared {
  const names = [...new Set([tag.name, ...tag.aliases].map(normalizeTagName).filter(Boolean))];
  const place = tag.kind === "place";
  return {
    main: normalizeTagName(tag.name),
    names,
    words: place ? [...new Set([tag.name, ...tag.aliases].flatMap(placeWords))] : [],
    point: place && tag.lat != null && tag.lng != null ? { lat: tag.lat, lng: tag.lng } : null,
  };
}

/**
 * 비슷한 태그 짝. 남길 쪽(keep)은 게시물이 많은 쪽, 같으면 이름이 짧은 쪽(대표 이름일 가능성이 큼).
 * 한 태그가 여러 짝에 들어갈 수 있다. 정렬: 같은 이름 → 별칭 → 포함 → 같은 낱말 → 가까운 위치, 그 안에서 게시물 합이 많은 순.
 */
export function findSimilarTags(tags: TagForSimilarity[], limit = 100): SimilarPair[] {
  const byKind = new Map<string, { tag: TagForSimilarity; prepared: Prepared }[]>();
  for (const tag of tags) {
    const list = byKind.get(tag.kind) ?? [];
    list.push({ tag, prepared: prepare(tag) });
    byKind.set(tag.kind, list);
  }

  const pairs: SimilarPair[] = [];
  for (const list of byKind.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const reason = relation(a.prepared, b.prepared);
        if (reason) pairs.push({ ...order(a.tag, b.tag), reason });
      }
    }
  }
  return pairs
    .sort((x, y) => RANK[x.reason] - RANK[y.reason] || y.keep.posts + y.drop.posts - (x.keep.posts + x.drop.posts))
    .slice(0, limit);
}

/** 두 태그의 관계. 낱말 · 위치 규칙은 둘 다 장소일 때만 (준비 단계에서 장소가 아니면 비워 둔다) */
function relation(a: Prepared, b: Prepared): SimilarReason | null {
  if (a.main && a.main === b.main) return "same";
  if (a.names.some((n) => b.names.includes(n))) return "alias";
  // 한쪽 이름(별칭 포함)이 다른 쪽 이름에 통째로 들어 있으면
  for (const x of a.names) {
    for (const y of b.names) {
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if (short.length >= MIN_CONTAINED && long.includes(short)) return "contains";
    }
  }
  if (a.words.some((w) => b.words.includes(w))) return "word";
  if (a.point && b.point && distanceMeters(a.point, b.point) <= NEAR_METERS) return "near";
  return null;
}

/**
 * 새 태그를 만들기 전에: 이 이름과 같은 대상일 것 같은 기존 태그 (업로드 화면 안내).
 * 종류는 가리지 않는다 (종류를 잘못 고른 경우도 잡게). 낱말 규칙은 기존 태그가 장소일 때만.
 * 같은 이름 → 별칭 → 포함 → 같은 낱말, 그 안에서 게시물 많은 순.
 */
export function similarToName<T extends TagForSimilarity>(name: string, tags: T[], limit = 5): (T & { reason: SimilarReason })[] {
  const main = normalizeTagName(name);
  if (!main) return [];
  return tags
    .flatMap((tag) => {
      const other = prepare(tag);
      const mine: Prepared = { main, names: [main], words: tag.kind === "place" ? placeWords(name) : [], point: null };
      const reason = relation(mine, other);
      return reason ? [{ ...tag, reason }] : [];
    })
    .sort((x, y) => RANK[x.reason] - RANK[y.reason] || y.posts - x.posts)
    .slice(0, limit);
}

/** DB에서 후보를 찾을 검색 낱말: 띄어쓰기 · 기호로 나눈 2자 이상 낱말 중 긴 것부터 6개 (글자 · 숫자만이라 검색 조건에 그대로 써도 된다) */
export function searchWords(name: string): string[] {
  const words = name
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2);
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 6);
}

function order(a: TagForSimilarity, b: TagForSimilarity): { keep: TagForSimilarity; drop: TagForSimilarity } {
  if (a.posts !== b.posts) return a.posts > b.posts ? { keep: a, drop: b } : { keep: b, drop: a };
  return a.name.length <= b.name.length ? { keep: a, drop: b } : { keep: b, drop: a };
}

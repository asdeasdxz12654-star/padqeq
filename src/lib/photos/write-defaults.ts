import { CATEGORIES, CATEGORY_LABEL } from "./categories";

// 글쓰기 › 사진 올리기 (캔버스 36–40): 작성 목록에서 고른 분류로 시작하고, 분류에 맞춰 기본값만 바꾼다.

export type Category = (typeof CATEGORIES)[number];

export function parseCategory(value: unknown): Category | null {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value) ? (value as Category) : null;
}

/** 사람이 주로 나오는 분류만 '사진에 사람이 나와요'를 켠 채로 시작한다 (풍경 · 여행 · 기타는 나오면 직접 켠다) */
export function peopleByDefault(category: Category): boolean {
  return category === "cosplay" || category === "model";
}

/** 가림 표시(피 · 공포 분장 등)는 코스프레 · 기타에서만 고르게 한다 */
export function veilOffered(category: Category): boolean {
  return category === "cosplay" || category === "other";
}

/** 올리기 화면 제목 */
export function uploadHeading(category: Category | null): string {
  if (category === "model") return "인물 사진 올리기";
  if (category === null || category === "other") return "사진 올리기";
  return `${CATEGORY_LABEL[category]} 사진 올리기`;
}

/**
 * 제목을 비웠을 때 쓸 제목: 첫 태그 · 촬영일 (예: 라이덴 쇼군 · 10.12).
 * 태그가 없으면 분류 이름, 촬영일이 없으면 이름만. DB의 제목 필수 규칙(1–80자)을 늘 지킨다.
 */
export function autoTitle({ tagName, category, shotOn }: { tagName: string | null; category: Category; shotOn: string | null }): string {
  const name = (tagName?.trim() || CATEGORY_LABEL[category]).slice(0, 60);
  const day = shotOn && /^\d{4}-(\d{2})-(\d{2})$/.exec(shotOn);
  return day ? `${name} · ${Number(day[1])}.${Number(day[2])}` : name;
}

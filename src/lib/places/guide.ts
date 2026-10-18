import { z } from "zod";

// 촬영지 가이드 (공식 장소 태그): 추천 시간대 · 입장료 · 삼각대 · 주차 · 한 줄 팁. 모두 비우면 지운다.

export const GUIDE_FIELDS = [
  { key: "bestTime", label: "추천 시간대", placeholder: "예: 해 질 녘 30분 전", max: 80 },
  { key: "fee", label: "입장료", placeholder: "예: 무료 · 성인 3,000원", max: 80 },
  { key: "tripod", label: "삼각대", placeholder: "예: 가능 · 주말 금지", max: 80 },
  { key: "parking", label: "주차", placeholder: "예: 공영 주차장 (유료)", max: 80 },
  { key: "tip", label: "한 줄 팁", placeholder: "예: 평화의 문 앞 잔디가 넓어요", max: 200 },
] as const;

export type GuideKey = (typeof GUIDE_FIELDS)[number]["key"];
export type PlaceGuide = Record<GuideKey, string>;

const line = (max: number, label: string) =>
  z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max, `${label}은(는) ${max}자까지예요.`).refine((v) => !/\p{Cc}/u.test(v), "쓸 수 없는 문자가 있어요."));

export const guideSchema = z.object(Object.fromEntries(GUIDE_FIELDS.map((f) => [f.key, line(f.max, f.label)])) as Record<GuideKey, ReturnType<typeof line>>);

export const isEmptyGuide = (g: PlaceGuide) => GUIDE_FIELDS.every((f) => g[f.key] === "");

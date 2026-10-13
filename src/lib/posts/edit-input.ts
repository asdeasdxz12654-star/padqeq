import { z } from "zod";
import { creditSchema, MAX_CREDITS_PER_POST } from "@/lib/photos/credit-input";
import { CATEGORIES, MAX_PHOTOS_PER_POST } from "@/lib/photos/post-input";
import { MAX_TAGS_PER_POST } from "@/lib/tags/tag-rules";
import { currentYearKst, MIN_YEAR } from "@/lib/year-chips";

// 게시물 편집 (S-07 ⑨). 사진 추가 · 사람 포함 여부는 여기서 바꾸지 않는다.
//  · photoOrder: 남길 사진 id를 보여 줄 순서대로 (빠진 사진은 지운다, 1장 이상)
//  · 크레딧은 남길 것(keep: 기존 id)과 새로 붙일 것(add)으로 받는다. 역할을 바꾸려면 빼고 다시 붙인다
//  · 사람 포함 여부는 촬영 동의 기록과 묶여 있어 바꾸지 않는다
const noControl = (v: string) => !/\p{Cc}/u.test(v.replace(/\r?\n/g, ""));

export const editSchema = z
  .object({
    postId: z.uuid(),
    title: z.string().trim().min(1, "제목을 입력해 주세요.").max(80, "제목은 80자까지예요.").refine(noControl, "쓸 수 없는 문자가 있어요."),
    body: z.string().trim().max(2000, "설명은 2000자까지예요.").refine(noControl, "쓸 수 없는 문자가 있어요."),
    category: z.enum(CATEGORIES, { error: "카테고리를 골라 주세요." }),
    shotYear: z
      .int()
      .min(MIN_YEAR, "촬영 연도를 확인해 주세요.")
      .refine((y) => y <= currentYearKst(), "촬영 연도를 확인해 주세요."),
    shotOn: z.iso.date({ error: "촬영 날짜를 확인해 주세요." }).nullable(),
    tagIds: z.array(z.uuid()).max(MAX_TAGS_PER_POST, `태그는 ${MAX_TAGS_PER_POST}개까지예요.`),
    alts: z
      .array(z.object({ photoId: z.uuid(), altText: z.string().trim().max(300, "사진 설명은 300자까지예요.").refine(noControl) }))
      .max(MAX_PHOTOS_PER_POST),
    photoOrder: z.array(z.uuid()).min(1, "사진은 1장 이상 남겨 주세요.").max(MAX_PHOTOS_PER_POST),
    credits: z.object({
      keep: z.array(z.uuid()).max(MAX_CREDITS_PER_POST),
      add: z.array(creditSchema).max(MAX_CREDITS_PER_POST),
    }),
  })
  .refine((v) => v.credits.keep.length + v.credits.add.length <= MAX_CREDITS_PER_POST, {
    error: `크레딧은 ${MAX_CREDITS_PER_POST}개까지예요.`,
    path: ["credits"],
  })
  .refine((v) => new Set(v.photoOrder).size === v.photoOrder.length, { error: "사진 순서를 확인해 주세요.", path: ["photoOrder"] })
  .refine((v) => v.shotOn === null || Number(v.shotOn.slice(0, 4)) === v.shotYear, {
    error: "촬영 날짜와 촬영 연도가 달라요.",
    path: ["shotOn"],
  });

export type EditInput = z.input<typeof editSchema>;

/** 태그 바꾸기: 뗄 것 · 붙일 것 */
export function diffTags(current: readonly string[], next: readonly string[]): { remove: string[]; add: string[] } {
  const now = new Set(current);
  const want = new Set(next);
  return { remove: [...now].filter((id) => !want.has(id)), add: [...want].filter((id) => !now.has(id)) };
}

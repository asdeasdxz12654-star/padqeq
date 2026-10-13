import { z } from "zod";

// 컬렉션 입력 규칙. DB 제약(제목 1~60자 · 설명 500자 · 제어 문자 금지)과 같은 기준.

export const MAX_COLLECTIONS = 100;
export const MAX_COLLECTION_POSTS = 200;

export const collectionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "제목을 입력해 주세요.")
    .max(60, "제목은 60자까지예요.")
    .refine((v) => !/\p{Cc}/u.test(v), "쓸 수 없는 문자가 있어요."),
  description: z
    .string()
    .trim()
    .max(500, "설명은 500자까지예요.")
    .refine((v) => !/\p{Cc}/u.test(v.replace(/\r?\n/g, "")), "쓸 수 없는 문자가 있어요."),
  isPublic: z.boolean(),
});

export type CollectionInput = z.input<typeof collectionSchema>;

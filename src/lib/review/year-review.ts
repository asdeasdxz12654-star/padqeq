import { z } from "zod";
import { CATEGORIES } from "@/lib/photos/post-input";
import { TAG_KINDS } from "@/lib/tags/tag-rules";

// DB 함수 my_year_review()가 돌려주는 JSON. 모양이 다르면 화면을 그리지 않는다.
const count = z.coerce.number().int().nonnegative();

export const yearReviewSchema = z.object({
  year: z.int(),
  posts: count,
  photos: count,
  months: z.record(z.string().regex(/^(?:[1-9]|1[0-2])$/), count),
  undated: count,
  categories: z.partialRecord(z.enum(CATEGORIES), count),
  top_tags: z.array(z.object({ slug: z.string(), name: z.string(), kind: z.enum(TAG_KINDS), count })),
  credited_in: count,
  partners: z.array(z.object({ handle: z.string(), count })),
  first_post: z.uuid().nullable(),
  last_post: z.uuid().nullable(),
});

export type YearReview = z.infer<typeof yearReviewSchema>;

/** 1~12월 막대 (사진이 없는 달은 0) */
export function monthBars(months: YearReview["months"]): { month: number; count: number; ratio: number }[] {
  const counts = Array.from({ length: 12 }, (_, i) => months[String(i + 1)] ?? 0);
  const max = Math.max(1, ...counts);
  return counts.map((c, i) => ({ month: i + 1, count: c, ratio: c / max }));
}

/** 가장 많이 담은 달 (같으면 이른 달). 없으면 null */
export function busiestMonth(months: YearReview["months"]): number | null {
  const bars = monthBars(months);
  const top = bars.reduce((best, bar) => (bar.count > best.count ? bar : best), bars[0]!);
  return top.count > 0 ? top.month : null;
}

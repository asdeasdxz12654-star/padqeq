import { z } from "zod";
import { CATEGORIES } from "@/lib/photos/post-input";
import { MAX_QUERY_LENGTH } from "./feed-params";

// 피드의 종류와 조건 (S-02 ④ 이어 보기). 화면과 '더 보기'(서버 액션)가 같은 정의로 같은 목록을 만든다.
// 브라우저에서 돌아오는 값이므로 서버에서 다시 검증한다 (볼 수 있는지는 RLS가 확인).

const year = z.int().min(1990).max(2100).nullable();

export const feedScopeSchema = z.discriminatedUnion("kind", [
  /** 홈: 전체 또는 팔로우 */
  z.object({ kind: z.literal("home"), year, following: z.boolean() }),
  /** 탐색: 검색어 · 카테고리 · 연도 · 최신/인기 */
  z.object({
    kind: z.literal("explore"),
    year,
    category: z.enum(CATEGORIES).nullable(),
    q: z.string().max(MAX_QUERY_LENGTH + 1).nullable(),
    sort: z.enum(["latest", "popular"]),
  }),
  /** 태그 허브 (작품이면 캐릭터 사진도) */
  z.object({ kind: z.literal("tag"), tagId: z.uuid(), year }),
  /** 프로필 작업물 */
  z.object({ kind: z.literal("author"), authorId: z.uuid(), year }),
  /** 프로필 크레딧된 작업 (남이 올렸고 승인된 글) */
  z.object({ kind: z.literal("credits"), memberId: z.uuid() }),
]);

export type FeedScope = z.infer<typeof feedScopeSchema>;

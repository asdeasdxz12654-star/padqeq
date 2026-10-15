"use server";

import { parseQuery } from "@/lib/posts/feed-params";
import { findCreators, findEvents, findTags } from "@/lib/search/find";
import type { TagKind } from "@/lib/tags/tag-rules";

export type Suggestions = {
  tags: { slug: string; name: string; kind: TagKind; parentName: string | null }[];
  creators: { handle: string; display_name: string }[];
  events: { id: string; name: string; starts_on: string; ends_on: string }[];
};

const EMPTY: Suggestions = { tags: [], creators: [], events: [] };

/** 입력 중 추천 (S-03 ①): 작품 · 캐릭터 · 행사 · 장소 태그, 크리에이터, 행사. "@"로 시작하면 크리에이터만. 볼 수 있는 것만 (RLS). */
export async function suggestSearch(raw: unknown): Promise<Suggestions> {
  if (typeof raw !== "string") return EMPTY;
  const query = parseQuery(raw);
  if (!query) return EMPTY;
  if (query.kind === "handle") return { ...EMPTY, creators: await findCreators(query.text, 6) };
  const [tags, creators, events] = await Promise.all([findTags(query.text, 6), findCreators(query.text, 4), findEvents(query.text, 3)]);
  return { tags: tags.map(({ slug, name, kind, parentName }) => ({ slug, name, kind, parentName })), creators, events };
}

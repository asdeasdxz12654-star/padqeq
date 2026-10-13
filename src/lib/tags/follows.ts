import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TagKind } from "./tag-rules";

export type FollowedTag = { id: string; slug: string; name: string; kind: TagKind };

/** 내가 팔로우한 태그 (최근 팔로우 순). 볼 수 없게 된 태그는 빠진다 (RLS). */
export const getFollowedTags = cache(async (userId: string): Promise<FollowedTag[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tag_follows")
    .select("created_at, tag:tags(id, slug, name, kind)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return data.flatMap((row) => (row.tag ? [row.tag] : []));
});

/** 팔로우 피드에 넣을 태그 id: 팔로우한 태그 + 팔로우한 작품의 캐릭터 */
export async function followedFeedTagIds(userId: string): Promise<string[]> {
  const followed = await getFollowedTags(userId);
  const works = followed.filter((t) => t.kind === "work").map((t) => t.id);
  if (!works.length) return followed.map((t) => t.id);
  const supabase = await createClient();
  const { data } = await supabase.from("tags").select("id").in("parent_id", works).limit(1000);
  return [...new Set([...followed.map((t) => t.id), ...(data ?? []).map((t) => t.id)])];
}

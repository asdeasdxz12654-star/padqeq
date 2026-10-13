import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { TagKind } from "@/lib/tags/tag-rules";

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

/** 내가 팔로우한 회원 (최근 팔로우 순). 탈퇴 유예 중인 회원은 빠진다 (RLS). */
export const getFollowedMembers = cache(async (userId: string): Promise<FollowedMember[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("member_follows")
    .select("created_at, member:profiles!member_follows_followee_id_fkey(id, handle, display_name)")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data.flatMap((row) => (row.member ? [row.member] : []));
});

export type FollowedMember = { id: string; handle: string; display_name: string };

/** 팔로우 피드 조건: 팔로우한 태그(+ 팔로우한 작품의 캐릭터) · 팔로우한 회원 */
export async function followedFeed(userId: string): Promise<{ tagIds: string[]; authorIds: string[] }> {
  const [followed, members] = await Promise.all([getFollowedTags(userId), getFollowedMembers(userId)]);
  const authorIds = members.map((m) => m.id);
  const works = followed.filter((t) => t.kind === "work").map((t) => t.id);
  if (!works.length) return { tagIds: followed.map((t) => t.id), authorIds };
  const supabase = await createClient();
  const { data } = await supabase.from("tags").select("id").in("parent_id", works).limit(1000);
  return { tagIds: [...new Set([...followed.map((t) => t.id), ...(data ?? []).map((t) => t.id)])], authorIds };
}

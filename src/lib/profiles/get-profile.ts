import "server-only";
import { cache } from "react";
import { HANDLE_PATTERN } from "@/lib/auth/signup-input";
import { createClient } from "@/lib/supabase/server";

/** 프로필 화면용: 공개 프로필 + 게시물 수 + 사진을 올린 촬영 연도 */
export const getProfileByHandle = cache(async (rawHandle: string) => {
  let handle: string;
  try {
    handle = decodeURIComponent(rawHandle).replace(/^@/, "").toLowerCase();
  } catch {
    return null;
  }
  if (!HANDLE_PATTERN.test(handle)) return null;

  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, handle, display_name, bio, role, created_at, cover_post_id, links, pinned_post_ids")
    .eq("handle", handle)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const [count, years] = await Promise.all([
    supabase.from("posts").select("id", { count: "exact", head: true }).eq("author_id", profile.id).eq("status", "published"),
    supabase.from("posts").select("shot_year").eq("author_id", profile.id).eq("status", "published").limit(1000),
  ]);
  return {
    ...profile,
    postCount: count.count ?? 0,
    years: [...new Set((years.data ?? []).map((r) => r.shot_year))],
  };
});

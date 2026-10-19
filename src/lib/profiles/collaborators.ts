import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Pairing } from "./rank-collaborators";

/**
 * 프로필 '자주 함께한 사람' · '함께한 기록'의 재료: 이 회원이 올린 글의 승인된 크레딧 회원 +
 * 이 회원이 크레딧된 글의 업로더 · 다른 크레딧 회원. 볼 수 있는 게시된 글만 (RLS).
 */
export async function loadPairings(memberId: string, creditedIds: string[]): Promise<Pairing[]> {
  const supabase = await createClient();
  const [mine, credited, coCredits] = await Promise.all([
    supabase
      .from("credits")
      .select("post_id, member:profiles!credits_member_id_fkey(handle, display_name), post:posts!credits_post_id_fkey!inner(author_id, status)")
      .eq("status", "approved")
      .eq("post.author_id", memberId)
      .eq("post.status", "published")
      .not("member_id", "is", null)
      .limit(1000),
    creditedIds.length
      ? supabase.from("posts").select("id, author:profiles!posts_author_id_fkey(handle, display_name)").in("id", creditedIds).eq("status", "published")
      : Promise.resolve({ data: [] }),
    creditedIds.length
      ? supabase
          .from("credits")
          .select("post_id, member:profiles!credits_member_id_fkey(handle, display_name)")
          .in("post_id", creditedIds)
          .eq("status", "approved")
          .not("member_id", "is", null)
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ]);
  return [
    ...(mine.data ?? []).flatMap((c) => (c.member ? [{ postId: c.post_id, handle: c.member.handle, displayName: c.member.display_name }] : [])),
    ...(credited.data ?? []).flatMap((p) => (p.author ? [{ postId: p.id, handle: p.author.handle, displayName: p.author.display_name }] : [])),
    ...(coCredits.data ?? []).flatMap((c) => (c.member ? [{ postId: c.post_id, handle: c.member.handle, displayName: c.member.display_name }] : [])),
  ];
}

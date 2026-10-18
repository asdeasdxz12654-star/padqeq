import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CommentView = {
  id: string;
  body: string;
  pinned: boolean;
  hidden: boolean;
  edited: boolean;
  createdAt: string;
  author: { id: string; handle: string; displayName: string; avatarKey: string | null };
  replies: CommentView[];
};

/** 글의 댓글 (RLS: 볼 수 있는 것만). 고정 댓글 → 오래된 순, 답글은 원댓글 아래 오래된 순. */
export async function getComments(postId: string): Promise<{ comments: CommentView[]; count: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, parent_id, body, pinned, hidden_at, edited_at, created_at, author:profiles!comments_author_id_fkey(id, handle, display_name, avatar_key)")
    .eq("post_id", postId)
    .order("created_at")
    .limit(1000);
  if (error) throw error;

  const views = new Map<string, CommentView & { parentId: string | null }>();
  for (const c of data) {
    if (!c.author) continue;
    views.set(c.id, {
      id: c.id,
      parentId: c.parent_id,
      body: c.body,
      pinned: c.pinned,
      hidden: c.hidden_at !== null,
      edited: c.edited_at !== null,
      createdAt: c.created_at,
      author: { id: c.author.id, handle: c.author.handle, displayName: c.author.display_name, avatarKey: c.author.avatar_key },
      replies: [],
    });
  }
  const top: CommentView[] = [];
  for (const view of views.values()) {
    const parent = view.parentId ? views.get(view.parentId) : null;
    if (view.parentId === null) top.push(view);
    else if (parent) parent.replies.push(view);
  }
  top.sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return { comments: top, count: views.size };
}

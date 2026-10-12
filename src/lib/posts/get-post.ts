import "server-only";
import { cache } from "react";
import { viewerSources, type ViewerSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ViewerPhoto = {
  id: string;
  width: number;
  height: number;
  alt: string;
  isPanorama: boolean;
  sources: ViewerSources;
};

/**
 * 상세 화면용 게시물. RLS가 볼 수 있는 글만 돌려주므로(게시됨 · 내 글 · 운영자)
 * 없거나 볼 수 없으면 null — 존재 여부를 구분하지 않는다 (P-04).
 */
export const getPost = cache(async (id: string) => {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select(
      `id, title, body, category, status, shot_year, shot_on, published_at, has_people, author_id,
       author:profiles!posts_author_id_fkey(handle, display_name),
       photos(id, storage_key, width, height, alt_text, is_panorama, position),
       credits(id, role, status, external_label, external_url, member:profiles!credits_member_id_fkey(handle, display_name))`,
    )
    .eq("id", id)
    .order("position", { referencedTable: "photos" })
    .maybeSingle();
  if (error) throw error;
  if (!post || !post.author) return null;

  const photos = (
    await Promise.all(
      post.photos.map(async (p): Promise<ViewerPhoto | null> => {
        const sources = await viewerSources(p);
        return sources
          ? {
              id: p.id,
              width: p.width,
              height: p.height,
              alt: p.alt_text || post.title,
              isPanorama: Boolean(p.is_panorama),
              sources,
            }
          : null;
      }),
    )
  ).filter((p): p is ViewerPhoto => p !== null);

  return { ...post, author: post.author, photos };
});

export type PostDetail = NonNullable<Awaited<ReturnType<typeof getPost>>>;

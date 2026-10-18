import { isUuid } from "@/lib/ids";
import "server-only";
import { type ExifInfo, exifLine } from "@/lib/photos/exif-info";
import { cache } from "react";
import { viewerSources, type ViewerSources } from "@/lib/photos/server";
import { createClient } from "@/lib/supabase/server";


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
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select(
      `id, title, body, category, status, held_at, removed_at, shot_year, shot_on, published_at, has_people, author_id, visibility, scheduled_at, comment_policy, show_exif, veil, veil_by_staff,
       author:profiles!posts_author_id_fkey(handle, display_name),
       photos(id, storage_key, width, height, alt_text, back_memo, is_panorama, position, ready_at, exif),
       credits(id, role, status, member_id, external_label, external_url, member:profiles!credits_member_id_fkey(handle, display_name)),
       post_tags(tag:tags(id, slug, name, kind))`,
    )
    .eq("id", id)
    .order("position", { referencedTable: "photos" })
    .maybeSingle();
  if (error) throw error;
  if (!post || !post.author) return null;

  const photos = (
    await Promise.all(
      // 파일이 다 올라가지 않은 추가 사진은 작성자에게도 보여 주지 않는다 (편집 화면에서만)
      post.photos.filter((p) => p.ready_at !== null || post.status === "draft").map(async (p): Promise<ViewerPhoto | null> => {
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

  // 태그: 작품 → 캐릭터 → 행사 → 장소 → 일반 순서 (S-06 ⑦)
  const order = ["work", "character", "event", "place", "general"];
  const tags = post.post_tags
    .flatMap((pt) => (pt.tag ? [pt.tag] : []))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, "ko"));

  // 촬영 정보: 업로더가 보여 주기로 한 경우 첫 사진의 장비 · 설정 (S-06 ⑧)
  const firstExif = post.show_exif ? exifLine(post.photos[0]?.exif as ExifInfo | null) : null;

  // 사진 뒷면 메모 (보이는 사진 순서대로, 몇 번째 사진인지와 함께)
  const shown = new Set(photos.map((p) => p.id));
  const photoMemos = post.photos
    .filter((p) => shown.has(p.id))
    .flatMap((p, i) => (p.back_memo ? [{ n: i + 1, memo: p.back_memo }] : []));

  return { ...post, author: post.author, photos, tags, exif: firstExif, photoMemos };
});

export type PostDetail = NonNullable<Awaited<ReturnType<typeof getPost>>>;

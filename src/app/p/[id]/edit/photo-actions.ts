"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { masterPhoto, MAX_PHOTOS_PER_POST } from "@/lib/photos/post-input";
import { photoStore } from "@/lib/photos/store";
import { objectKey, storageToken, VARIANT_NAMES } from "@/lib/photos/variants";
import { createClient } from "@/lib/supabase/server";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const addSchema = z.object({ postId: z.uuid(), photos: z.array(masterPhoto).min(1).max(MAX_PHOTOS_PER_POST) });

/** 게시된 글에 사진 추가 1단계: 사진 행 + 워터마크 열쇠. 파일은 이후 /api/photos 로 올린다. */
export async function addPhotos(input: z.input<typeof addSchema>): Promise<Result<{ photoIds: string[] }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "사진 정보를 확인해 주세요." };
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return { ok: false, error: "업로드 권한이 없어요." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_my_photos", {
    target: parsed.data.postId,
    entries: parsed.data.photos.map((p) => ({
      width: p.width,
      height: p.height,
      bytes: p.bytes,
      alt_text: p.altText,
      taken_at: p.takenAt,
      seed: p.watermarkSeed,
    })),
  });
  if (error) {
    if (error.message.includes("photo_limit")) return { ok: false, error: `사진은 게시물당 ${MAX_PHOTOS_PER_POST}장까지예요.` };
    if (error.message.includes("people_admin_only")) return { ok: false, error: "사람이 나오는 게시물에는 지금은 운영자만 사진을 더할 수 있어요." };
    return { ok: false, error: "사진을 더할 수 없는 게시물이에요." };
  }
  const { error: hashError } = await supabase.rpc("set_photo_hashes", {
    target_post: parsed.data.postId,
    entries: data.map((photo_id, i) => ({ photo_id, hash: parsed.data.photos[i]!.phash })),
  });
  if (hashError) {
    return {
      ok: false,
      error: hashError.message.includes("photo_blocked")
        ? "운영 정책에 따라 게시가 중단된 사진과 같은 사진이 있어 더할 수 없어요."
        : "사진 정보를 저장하지 못했어요.",
    };
  }
  const exifEntries = data.flatMap((photo_id, i) => (parsed.data.photos[i]!.exif ? [{ photo_id, exif: parsed.data.photos[i]!.exif }] : []));
  if (exifEntries.length) await supabase.rpc("set_photo_exif", { target_post: parsed.data.postId, entries: exifEntries });
  return { ok: true, data: { photoIds: data } };
}

const finishSchema = z.object({ postId: z.uuid(), photoIds: z.array(z.uuid()).min(1).max(MAX_PHOTOS_PER_POST) });

/** 2단계: 변환본 5개가 모두 저장소에 있는지 확인하고 공개한다 */
export async function finishPhotos(input: z.input<typeof finishSchema>): Promise<Result<null>> {
  const parsed = finishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await getViewer();
  if (!viewer?.profile) return { ok: false, error: "로그인이 필요해요." };

  const { postId, photoIds } = parsed.data;
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, storage_key, post:posts!inner(author_id)")
    .eq("post_id", postId)
    .in("id", photoIds)
    .is("ready_at", null);
  if (error || !rows || rows.length !== photoIds.length || rows.some((r) => r.post.author_id !== viewer.id)) {
    return { ok: false, error: "사진을 찾을 수 없어요." };
  }

  const store = await photoStore();
  const checks = await Promise.all(
    rows.flatMap((r) => {
      const token = storageToken(r.storage_key);
      return token ? VARIANT_NAMES.map((name) => store.exists(objectKey(token, name))) : [Promise.resolve(false)];
    }),
  );
  if (checks.some((ok) => !ok)) return { ok: false, error: "사진 파일이 다 올라가지 않았어요. 다시 시도해 주세요." };

  const { error: finishError } = await supabase.rpc("finish_my_photos", { target: postId, ids: photoIds });
  if (finishError) return { ok: false, error: "사진을 공개하지 못했어요." };
  revalidatePath("/", "layout");
  return { ok: true, data: null };
}

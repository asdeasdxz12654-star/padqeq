"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getViewer } from "@/lib/auth/viewer";
import { consentSchema, draftSchema, type ConsentInput, type DraftInput } from "@/lib/photos/post-input";
import { insertCredits } from "@/lib/photos/credit-rows";
import { photoStore } from "@/lib/photos/store";
import { objectKey, storageToken, VARIANT_NAMES } from "@/lib/photos/variants";
import { createClient } from "@/lib/supabase/server";

// 서버 액션은 공개 API와 같다: 입력 검증 → 로그인 → 권한 순서로 확인한다.

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function uploader() {
  const viewer = await getViewer();
  if (!viewer?.profile?.can_upload) return null;
  return viewer;
}

/** 1단계: 초안 게시물과 사진 행을 만든다. 사진 파일은 이후 /api/photos 로 올린다. */
export async function createDraft(input: DraftInput): Promise<Result<{ postId: string; photoIds: string[] }>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요." };
  const viewer = await uploader();
  if (!viewer) return { ok: false, error: "업로드 권한이 없어요." };

  const { title, body, category, shotYear, shotOn, hasPeople, photos, tagIds, credits } = parsed.data;
  const supabase = await createClient();

  const { data: post, error: postError } = await supabase
    .from("posts")
    .insert({ author_id: viewer.id, title, body, category, shot_year: shotYear, shot_on: shotOn, has_people: hasPeople })
    .select("id")
    .single();
  if (postError) return { ok: false, error: "게시물을 만들지 못했어요." };

  const { data: rows, error: photoError } = await supabase
    .from("photos")
    .insert(
      photos.map((p, position) => ({
        post_id: post.id,
        position,
        width: p.width,
        height: p.height,
        bytes: p.bytes,
        alt_text: p.altText,
        taken_at: p.takenAt,
      })),
    )
    .select("id, position");
  if (photoError || !rows) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { ok: false, error: "사진 정보를 저장하지 못했어요." };
  }

  const photoIds = rows.toSorted((a, b) => a.position - b.position).map((r) => r.id);

  // 워터마크 열쇠는 공개되지 않는 곳에 따로 보관한다
  const { error: seedError } = await supabase.rpc("set_photo_watermarks", {
    target_post: post.id,
    entries: photoIds.map((photo_id, i) => ({ photo_id, seed: photos[i]!.watermarkSeed })),
  });
  if (seedError) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { ok: false, error: "사진 정보를 저장하지 못했어요." };
  }

  // 사진 지문 (운영 정책으로 게시 중단된 사진과 같으면 거부)
  const { error: hashError } = await supabase.rpc("set_photo_hashes", {
    target_post: post.id,
    entries: photoIds.map((photo_id, i) => ({ photo_id, hash: photos[i]!.phash })),
  });
  if (hashError) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { ok: false, error: photoHashError(hashError.message) };
  }

  // 태그 (쓸 수 있는 태그인지는 RLS가 확인)
  if (tagIds.length) {
    const { error: tagError } = await supabase
      .from("post_tags")
      .insert([...new Set(tagIds)].map((tag_id) => ({ post_id: post.id, tag_id })));
    if (tagError) {
      await supabase.from("posts").delete().eq("id", post.id);
      return { ok: false, error: "태그를 붙이지 못했어요. 태그를 다시 골라 주세요." };
    }
  }
  // 크레딧 (회원은 승인 요청 · 미가입자는 바로 표시 · 나는 바로 승인)
  const creditResult = await insertCredits(supabase, post.id, viewer.id, credits);
  if (!creditResult.ok) {
    await supabase.from("posts").delete().eq("id", post.id);
    return { ok: false, error: creditResult.error };
  }

  return { ok: true, data: { postId: post.id, photoIds } };
}

const publishSchema = z.object({ postId: z.uuid() });

/** 2단계: 파일이 모두 올라갔는지 확인하고 게시한다. 사람이 나오면 촬영 동의 기록을 함께 남긴다. */
export async function publishPost(
  input: { postId: string },
  consent: ConsentInput | null,
): Promise<Result<{ postId: string }>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const consentParsed = consent ? consentSchema.safeParse(consent) : null;
  if (consentParsed && !consentParsed.success) {
    return { ok: false, error: consentParsed.error.issues[0]?.message ?? "동의 기록을 확인해 주세요." };
  }
  const viewer = await uploader();
  if (!viewer) return { ok: false, error: "업로드 권한이 없어요." };

  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select("id, author_id, status, has_people, photos(storage_key)")
    .eq("id", parsed.data.postId)
    .maybeSingle();
  if (error || !post || post.author_id !== viewer.id) return { ok: false, error: "게시물을 찾을 수 없어요." };
  if (post.status !== "draft") return { ok: false, error: "이미 게시된 글이에요." };
  if (post.photos.length === 0) return { ok: false, error: "사진이 없어요." };

  // 모든 사진의 변환본 5종이 저장소에 있어야 게시한다
  const store = await photoStore();
  const checks = await Promise.all(
    post.photos.flatMap(({ storage_key }) => {
      const token = storageToken(storage_key);
      return token ? VARIANT_NAMES.map((name) => store.exists(objectKey(token, name))) : [Promise.resolve(false)];
    }),
  );
  if (checks.includes(false)) return { ok: false, error: "아직 올라가지 않은 사진이 있어요. 다시 시도해 주세요." };

  if (post.has_people && !consentParsed) {
    return { ok: false, error: "사람이 나오는 사진은 촬영 동의 기록이 필요해요." };
  }
  const c = post.has_people ? consentParsed?.data : undefined;
  const { error: publishError } = await supabase.rpc("publish_my_post", {
    target: post.id,
    ...(c && {
      subject_label: c.subjectLabel,
      consented_on: c.consentedOn,
      consent_note: c.note,
      has_minor: c.hasMinor,
      guardian_consent: c.guardianConsent,
    }),
  });
  // 1단계는 운영자만 동의 기록을 남길 수 있다 (RLS). 게시 규칙(DB 트리거)도 여기서 걸린다.
  if (publishError) return { ok: false, error: "게시하지 못했어요. 촬영 동의 기록과 게시 규칙을 확인해 주세요." };

  revalidatePath("/");
  return { ok: true, data: { postId: post.id } };
}

/** 업로드를 그만두면 초안을 지운다 (파일은 다음 정리 작업에서 지운다) */
export async function discardDraft(input: { postId: string }): Promise<Result<null>> {
  const parsed = publishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "잘못된 요청이에요." };
  const viewer = await uploader();
  if (!viewer) return { ok: false, error: "업로드 권한이 없어요." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", parsed.data.postId)
    .eq("author_id", viewer.id)
    .eq("status", "draft");
  return error ? { ok: false, error: "초안을 지우지 못했어요." } : { ok: true, data: null };
}

function photoHashError(message: string): string {
  return message.includes("photo_blocked")
    ? "운영 정책에 따라 게시가 중단된 사진과 같은 사진이 있어 올릴 수 없어요."
    : "사진 정보를 저장하지 못했어요.";
}

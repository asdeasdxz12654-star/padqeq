import { isUuid } from "@/lib/ids";
import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { inspectImage } from "@/lib/photos/inspect";
import { photoStore } from "@/lib/photos/store";
import {
  isVariantName,
  objectKey,
  storageToken,
  VARIANTS,
  variantContentType,
  variantMaxBytes,
  variantSize,
} from "@/lib/photos/variants";
import { createClient } from "@/lib/supabase/server";

// 변환본 업로드 (P-01 ②~④).
// 브라우저가 만든 변환본을 받아 서버에서 다시 확인한 뒤 R2에 저장한다.
//  · 업로드 권한 + 내 초안 게시물의 사진 또는 내 업로드 자리(대량 업로드)인지 (RLS로 읽은 행 기준)
//  · 파일 내부 구조 · 형식 · 크기(px) · 용량이 DB에 적은 값과 맞는지
//  · 메타데이터(EXIF · GPS) 잔존 여부


const fail = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/photos/[id]/[variant]">) {
  const { id, variant } = await ctx.params;
  if (!isUuid(id) || !isVariantName(variant)) return fail(400, "잘못된 주소");

  // 쿠키 인증 API이므로 같은 사이트에서 온 요청만 받는다 (CSRF 방지)
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  if ((site !== null && site !== "same-origin") || (origin !== null && origin !== request.nextUrl.origin)) {
    return fail(403, "허용되지 않은 요청");
  }

  const viewer = await getViewer();
  if (!viewer) return fail(401, "로그인이 필요해요");
  if (!viewer.profile?.can_upload) return fail(403, "업로드 권한이 없어요");

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("photos")
    .select("storage_key, width, height, bytes, ready_at, post:posts!inner(author_id, status)")
    .eq("id", id)
    .maybeSingle();
  if (error) return fail(500, "사진 정보를 읽지 못했어요");
  let photo: { storage_key: string; width: number; height: number; bytes: number };
  if (row) {
    if (row.post.author_id !== viewer.id) return fail(404, "사진을 찾을 수 없어요");
    // 초안의 사진이나, 게시된 글에 새로 붙여 아직 다 올라가지 않은 사진만
    if (row.post.status !== "draft" && row.ready_at !== null) return fail(409, "게시된 사진은 바꿀 수 없어요");
    photo = row;
  } else {
    // 업로드 자리 (본인 것만 읽힌다, RLS)
    const { data: slot, error: slotError } = await supabase.from("upload_slots").select("storage_key, width, height, bytes").eq("id", id).maybeSingle();
    if (slotError) return fail(500, "사진 정보를 읽지 못했어요");
    if (!slot) return fail(404, "사진을 찾을 수 없어요");
    photo = slot;
  }

  const token = storageToken(photo.storage_key);
  if (!token) return fail(500, "저장 위치가 올바르지 않아요");

  // 용량은 본문을 읽기 전에 먼저 막는다
  const maxBytes = variantMaxBytes(photo.width, photo.height, variant);
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isFinite(declared) || declared <= 0) return fail(411, "파일 크기가 필요해요");
  if (declared > maxBytes) return fail(413, "파일이 너무 커요");

  const body = await request.arrayBuffer();
  if (body.byteLength !== declared || body.byteLength > maxBytes) return fail(400, "파일 크기가 맞지 않아요");
  // 마스터는 DB에 적은 용량과 정확히 같아야 한다
  if (variant === "4000" && body.byteLength !== photo.bytes) return fail(400, "마스터 용량이 등록 값과 달라요");

  const inspected = inspectImage(body);
  if (!inspected.ok) return fail(415, inspected.reason);
  if (inspected.format !== VARIANTS[variant].format) return fail(415, "형식이 맞지 않아요");

  const expected = variantSize(photo.width, photo.height, variant);
  if (inspected.width !== expected.width || inspected.height !== expected.height) {
    return fail(422, `크기가 맞지 않아요 (${expected.width}×${expected.height} 필요)`);
  }

  await (await photoStore()).put(objectKey(token, variant), body, variantContentType(variant));
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

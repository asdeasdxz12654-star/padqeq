import type { NextRequest } from "next/server";
import { getViewer } from "@/lib/auth/viewer";
import { inspectImage } from "@/lib/photos/inspect";
import { photoStore } from "@/lib/photos/store";
import { AVATAR_SIZE, avatarKey } from "@/lib/profiles/avatar";
import { createClient } from "@/lib/supabase/server";

// 프로필 사진 올리기 · 내리기.
// 사진 게시물과 달리 워터마크 · 서명 게이트를 거치지 않는다 (어디서나 보여야 하고 캐시돼야 한다).
// 브라우저가 만든 AVIF를 받아 서버에서 형식 · 크기 · 용량을 다시 확인한 뒤 R2에 넣는다.

const MAX_BYTES = 200_000;

const fail = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

export async function PUT(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer?.profile) return fail(401, "로그인이 필요해요.");
  if (viewer.restriction) return fail(403, "지금은 프로필을 바꿀 수 없어요.");

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return fail(400, "빈 파일이에요.");
  if (body.byteLength > MAX_BYTES) return fail(413, "사진이 너무 커요.");

  const inspected = inspectImage(body);
  if (!inspected.ok) return fail(415, inspected.reason);
  if (inspected.format !== "avif") return fail(415, "AVIF만 올릴 수 있어요.");
  if (inspected.width !== AVATAR_SIZE || inspected.height !== AVATAR_SIZE) {
    return fail(422, `${AVATAR_SIZE}×${AVATAR_SIZE} 크기여야 해요.`);
  }

  // 열쇠는 매번 새로 만든다. 주소가 바뀌어야 캐시된 예전 사진이 남지 않는다.
  const key = avatarKey(viewer.id);
  await (await photoStore()).put(key, body, "image/avif");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_avatar", { key });
  if (error) return fail(400, "프로필 사진을 바꾸지 못했어요.");
  return Response.json({ key }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE() {
  const viewer = await getViewer();
  if (!viewer?.profile) return fail(401, "로그인이 필요해요.");
  const supabase = await createClient();
  // 파일은 남겨 둔다 (예전 주소를 보던 캐시가 깨지지 않게). 쓰이지 않는 파일은 정리 작업이 지운다.
  const { error } = await supabase.rpc("set_my_avatar", { key: null });
  if (error) return fail(400, "프로필 사진을 내리지 못했어요.");
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

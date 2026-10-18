import { photoStore } from "@/lib/photos/store";
import { isAvatarKey } from "@/lib/profiles/avatar";

// 프로필 사진 내보내기. 누구나 보는 것이라 서명도 워터마크도 없다.
// 열쇠가 바뀌면 주소도 바뀌므로(새 무작위 이름) 오래 캐시해도 안전하다.

export async function GET(_request: Request, ctx: RouteContext<"/avatar/[...key]">) {
  const { key } = await ctx.params;
  const path = key.join("/");
  // 주소로 들어온 값은 믿지 않는다 (../ 같은 것이 섞이면 거절)
  if (!isAvatarKey(path)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  const object = await (await photoStore()).get(path);
  if (!object) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });

  return new Response(object.body, {
    headers: {
      "Content-Type": "image/avif",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Robots-Tag": "noai, noimageai",
    },
  });
}

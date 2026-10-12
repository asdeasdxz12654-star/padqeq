import type { NextRequest } from "next/server";
import { imageUrlSecret } from "@/lib/photos/server";
import { verifyImageRequest } from "@/lib/photos/signed-url";
import { photoStore } from "@/lib/photos/store";
import { objectKey, type VariantName, variantContentType } from "@/lib/photos/variants";

// 이미지 게이트 (P-01 ⑥ · P-02).
//  · 서명 · 만료 확인 → DB 조회 없이 R2에서 바로 내보낸다
//  · 다른 사이트에 붙이기 · 새 탭에서 열기 · 검색 · AI 수집 차단 헤더
// 서명은 볼 권한을 확인한 서버 화면에서만 만들어진다 (lib/photos/server.ts).

const deny = (status: number) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, noimageindex, noai, noimageai" },
  });

export async function GET(request: NextRequest, ctx: RouteContext<"/img/[token]/[variant]">) {
  const { token, variant } = await ctx.params;
  const { searchParams } = request.nextUrl;

  // 브라우저가 보내는 요청 출처 정보. 헤더가 없는 오래된 브라우저는 서명만으로 판단.
  //  · <img>(image): 같은 사이트 안에서만
  //  · 상세 뷰어의 fetch(empty): 같은 출처에서만 (canvas에 그리기 위해)
  //  · 주소를 직접 열기(document) · 다른 사이트에서 불러오기: 거부
  const site = request.headers.get("sec-fetch-site");
  const dest = request.headers.get("sec-fetch-dest");
  if (site === "cross-site") return deny(403);
  if (dest !== null && dest !== "image" && !(dest === "empty" && site === "same-origin")) return deny(403);

  const check = await verifyImageRequest(imageUrlSecret(), {
    token,
    variant,
    expires: searchParams.get("e"),
    signature: searchParams.get("s"),
  });
  if (!check.ok) return deny(check.status);

  const name = variant as VariantName;
  const object = await (await photoStore()).get(objectKey(token, name));
  if (!object) return deny(404);

  if (request.headers.get("if-none-match") === object.etag) {
    return new Response(null, { status: 304, headers: { ETag: object.etag, Vary: "Sec-Fetch-Dest, Sec-Fetch-Site" } });
  }

  return new Response(object.body, {
    headers: {
      "Content-Type": variantContentType(name),
      "Content-Length": String(object.size),
      ETag: object.etag,
      // 서명 주소마다 따로 캐시. 공유 캐시(CDN)에는 남기지 않는다.
      "Cache-Control": "private, max-age=600",
      // 브라우저가 <img>로 받은 캐시를 "새 탭에서 이미지 열기"(document)에 다시 쓰지 않도록
      Vary: "Sec-Fetch-Dest, Sec-Fetch-Site",
      "Content-Disposition": "inline",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, noimageindex, noai, noimageai",
    },
  });
}

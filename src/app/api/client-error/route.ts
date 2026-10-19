import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 화면 오류 기록: 오류 화면(error.tsx)이 오류 번호(digest)와 화면 주소만 보낸다.
// 누가 겪었는지는 남기지 않는다. 형식 확인은 DB 함수(report_client_error)가 한 번 더 한다.

const noContent = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  // 우리 화면에서 보낸 것만 (다른 사이트에서 마구 보내는 것을 막는다)
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== request.nextUrl.host) return noContent();
  const text = await request.text();
  if (text.length > 512) return noContent();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return noContent();
  }
  const { digest, path } = (body ?? {}) as { digest?: unknown; path?: unknown };
  if (typeof digest !== "string" || typeof path !== "string") return noContent();
  // 주소 뒤 조건(?q= 등)은 남기지 않는다
  const cleanPath = path.split(/[?#]/)[0]!.slice(0, 200);
  const supabase = await createClient();
  await supabase.rpc("report_client_error", { digest: digest.slice(0, 64), path: cleanPath });
  return noContent();
}

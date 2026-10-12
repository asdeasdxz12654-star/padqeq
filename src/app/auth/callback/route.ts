import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

// 로그인 뒤 들르는 곳.
//  · Google 로그인: ?code= 를 세션으로 바꾼다 (PKCE, 같은 브라우저에서만 성공)
//  · 이미 로그인된 상태로 들어오면 바로 다음 단계로
// 가입(핸들 입력)을 마치지 않았으면 /welcome 으로 보낸다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const fail = (reason: "oauth" | "expired" | "session") =>
    go(`${withNext("/login", next)}${next === "/" ? "?" : "&"}error=${reason}`);

  // 사용자가 Google 동의 화면에서 취소한 경우 등
  if (searchParams.has("error")) return fail("oauth");

  const supabase = await createClient();
  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return fail(error.code === "flow_state_expired" ? "expired" : "oauth");
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return fail("session");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.claims.sub).maybeSingle();
  return go(profile ? next : withNext("/welcome", next));
}

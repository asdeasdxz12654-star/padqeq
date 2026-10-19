import { type NextRequest, NextResponse } from "next/server";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

// 로그인 뒤 들르는 곳.
//  · 카카오 · Google 로그인: ?code= 를 세션으로 바꾼다 (PKCE, 같은 브라우저에서만 성공)
//  · 이미 로그인된 상태로 들어오면 바로 다음 단계로
// 가입(핸들 입력)을 마치지 않았으면 /welcome 으로 보낸다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  // 설정에서 로그인 방법을 연결하다 돌아온 경우: 실패하면 설정 화면에 이유를 보여 준다 (이미 로그인된 상태)
  const linking = searchParams.get("link") === "1";
  const go = (path: string) => {
    const response = NextResponse.redirect(new URL(path, origin), 303);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  const fail = (reason: "oauth" | "expired" | "session") =>
    go(`${withNext("/login", next)}${next === "/" ? "?" : "&"}error=${reason}`);

  if (linking && (searchParams.has("error") || searchParams.has("error_code"))) {
    const code = searchParams.get("error_code") ?? "oauth";
    return go(`/settings?link_error=${encodeURIComponent(code.replace(/[^a-z_]/g, "").slice(0, 40) || "oauth")}#account-heading`);
  }
  // 사용자가 카카오 · Google 동의 화면에서 취소한 경우 등
  if (searchParams.has("error")) return fail("oauth");

  const supabase = await createClient();
  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (linking) return go(`/settings?link_error=${error.code === "identity_already_exists" ? "identity_already_exists" : "oauth"}#account-heading`);
      return fail(error.code === "flow_state_expired" ? "expired" : "oauth");
    }
  }

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return fail("session");

  const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.claims.sub).maybeSingle();
  return go(profile ? next : withNext("/welcome", next));
}

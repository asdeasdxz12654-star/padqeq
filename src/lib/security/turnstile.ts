import "server-only";

// Cloudflare Turnstile 서버 확인 (가입 봇 방지, P-02)
//  · 비밀값 TURNSTILE_SECRET_KEY가 없으면 확인을 건너뛴다 (설정 전 배포 · 로컬 개발)
//  · 공개 사이트 키 TURNSTILE_SITE_KEY는 화면이 위젯을 그릴 때 쓴다

export function turnstileSiteKey(): string | null {
  return process.env.TURNSTILE_SITE_KEY || null;
}

export async function verifyTurnstile(token: FormDataEntryValue | null, ip: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

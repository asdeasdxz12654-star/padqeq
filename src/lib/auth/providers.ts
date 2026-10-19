import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";

// Supabase 대시보드에서 켠 로그인 방법을 확인한다 (꺼진 방법은 버튼을 숨기고, 모두 꺼져 있으면 안내 문구).
const settingsSchema = z.object({
  external: z.object({ google: z.boolean().default(false), kakao: z.boolean().default(false) }),
});

/** 네이버는 Supabase 기본 제공이 아니라 직접 연결한 OIDC 로그인 (대시보드 › Auth › Providers › custom:naver) */
export const NAVER_PROVIDER = "custom:naver";

export type LoginProviders = { kakao: boolean; naver: boolean; google: boolean };

export async function loginProviders(): Promise<LoginProviders> {
  const [builtIn, naver] = await Promise.all([builtInProviders(), customProviderEnabled(NAVER_PROVIDER)]);
  return { ...builtIn, naver };
}

async function builtInProviders(): Promise<{ google: boolean; kakao: boolean }> {
  try {
    const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`auth settings ${res.status}`);
    const { external } = settingsSchema.parse(await res.json());
    return { google: external.google, kakao: external.kakao };
  } catch {
    // 설정을 못 읽어도 오래 써 온 Google 버튼은 보여 준다 (실패하면 콜백에서 안내). 카카오는 켜진 게 확인될 때만.
    return { google: true, kakao: false };
  }
}

/**
 * 직접 연결한 로그인은 설정 목록에 나오지 않으므로, 로그인 시작 주소가 그 회사로 넘겨 주는지(302)로 확인한다.
 * 없거나 꺼져 있으면 Supabase가 400을 돌려준다. 확인하지 못하면 숨긴다.
 */
async function customProviderEnabled(provider: string): Promise<boolean> {
  try {
    const url = new URL(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/authorize`);
    url.searchParams.set("provider", provider);
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(3000) });
    return res.status >= 300 && res.status < 400;
  } catch {
    return false;
  }
}

import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";

// Supabase 대시보드에서 켠 로그인 방법을 확인한다 (꺼진 방법은 버튼을 숨기고, 모두 꺼져 있으면 안내 문구).
const settingsSchema = z.object({
  external: z.object({ google: z.boolean().default(false), kakao: z.boolean().default(false) }),
});

export type LoginProviders = { google: boolean; kakao: boolean };

export async function loginProviders(): Promise<LoginProviders> {
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

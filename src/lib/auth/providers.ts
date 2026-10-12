import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";

// Supabase 대시보드에서 Google 로그인을 켰는지 확인한다 (꺼져 있으면 안내 문구를 보여 줌).
const settingsSchema = z.object({
  external: z.object({ google: z.boolean().default(false) }),
});

export async function isGoogleEnabled(): Promise<boolean> {
  try {
    const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`auth settings ${res.status}`);
    return settingsSchema.parse(await res.json()).external.google;
  } catch {
    // 설정을 못 읽어도 버튼은 보여 준다 (실패하면 콜백에서 안내)
    return true;
  }
}

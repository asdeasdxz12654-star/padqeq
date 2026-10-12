import "server-only";
import { z } from "zod";
import { publicEnv } from "@/lib/env";

// Supabase 대시보드에서 켠 로그인 방법만 버튼으로 보여 준다.
const settingsSchema = z.object({
  external: z.object({
    kakao: z.boolean().default(false),
    google: z.boolean().default(false),
    email: z.boolean().default(false),
  }),
});

export type AuthProviders = z.infer<typeof settingsSchema>["external"];

export async function getAuthProviders(): Promise<AuthProviders> {
  try {
    const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error(`auth settings ${res.status}`);
    return settingsSchema.parse(await res.json()).external;
  } catch {
    // 설정을 못 읽어도 이메일 로그인은 시도할 수 있게 둔다
    return { kakao: false, google: false, email: true };
  }
}

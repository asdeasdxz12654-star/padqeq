import { z } from "zod";

// 브라우저에도 노출되는 값. NEXT_PUBLIC_ 값은 빌드 때 코드에 박히므로
// process.env.X 형태로 하나씩 직접 읽어야 한다.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .startsWith("sb_publishable_", "새 publishable 키를 쓰세요 (예전 anon JWT 키 금지)"),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});


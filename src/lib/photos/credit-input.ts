import { z } from "zod";
import { HANDLE_PATTERN } from "@/lib/auth/signup-input";

// 크레딧 입력 규칙 (S-08 · A-02 ⑤). DB 제약 credit_target · external_url ^https:// 와 같은 기준.

export const CREDIT_ROLES = ["cosplayer", "model", "photographer", "retoucher", "other"] as const;
export type CreditRole = (typeof CREDIT_ROLES)[number];

export const CREDIT_ROLE_LABEL: Record<CreditRole, string> = {
  cosplayer: "코스어",
  model: "모델",
  photographer: "촬영",
  retoucher: "보정",
  other: "기타",
};

export const MAX_CREDITS_PER_POST = 10;

/** 외부 링크: https만, 사용자 정보 · 이상한 문자 없는 주소 */
export function cleanExternalUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  url.protocol = "https:";
  if (url.username || url.password || !url.hostname.includes(".")) return null;
  const out = url.toString();
  return out.length <= 300 ? out : null;
}

export const creditSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member"),
    role: z.enum(CREDIT_ROLES),
    handle: z.string().regex(HANDLE_PATTERN, "핸들을 확인해 주세요."),
  }),
  z.object({
    kind: z.literal("external"),
    role: z.enum(CREDIT_ROLES),
    label: z
      .string()
      .trim()
      .min(1, "이름을 입력해 주세요.")
      .max(60, "이름은 60자까지예요.")
      .refine((v) => !/\p{Cc}/u.test(v), "쓸 수 없는 문자가 있어요."),
    url: z
      .string()
      .default("")
      .transform((v, ctx) => {
        if (!v.trim()) return null;
        const cleaned = cleanExternalUrl(v);
        if (!cleaned) ctx.addIssue({ code: "custom", message: "링크 주소를 확인해 주세요." });
        return cleaned;
      }),
  }),
]);
export type CreditInput = z.input<typeof creditSchema>;

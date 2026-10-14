import { z } from "zod";

// 가입 화면(S-01 ②)의 입력 규칙. DB 함수 create_my_profile()과 같은 규칙을 쓰고,
// 최종 판단은 DB가 한다 (여기서는 빠른 안내용).

/** 동의한 약관 · 개인정보처리방침 버전. 문서를 고치면 올린다. */
export const POLICY_VERSION = "2026-10-14.4";

export const MIN_AGE = 14;

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

const kstDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** 서울 기준 오늘 (YYYY-MM-DD) */
export function todayKst(now: Date = new Date()): string {
  return kstDate.format(now);
}

/** 서울 기준 만 나이 */
export function ageOnKst(birthDate: string, now: Date = new Date()): number {
  const [by, bm, bd] = birthDate.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = todayKst(now).split("-").map(Number) as [number, number, number];
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

const checked = (message: string) => z.literal("on", { error: message });

export const signupSchema = z.object({
  handle: z.string().trim().regex(HANDLE_PATTERN, { error: "영문 소문자 · 숫자 · _ 로 3~20자를 입력해 주세요." }),
  displayName: z
    .string()
    .trim()
    .min(1, { error: "표시 이름을 입력해 주세요." })
    .max(40, { error: "표시 이름은 40자까지예요." })
    .refine((v) => !/\p{Cc}/u.test(v), { error: "쓸 수 없는 문자가 있어요." }),
  birthDate: z.iso
    .date({ error: "생년월일을 입력해 주세요." })
    .refine((v) => v >= "1900-01-01" && v <= todayKst(), { error: "생년월일을 확인해 주세요." })
    .refine((v) => ageOnKst(v) >= MIN_AGE, { error: `만 ${MIN_AGE}세 이상부터 가입할 수 있어요.` }),
  agreeTerms: checked("이용약관에 동의해 주세요."),
  agreePrivacy: checked("개인정보 수집 · 이용에 동의해 주세요."),
});

export type SignupField = "handle" | "displayName" | "birthDate" | "agree" | "form";

/** DB 함수가 돌려준 오류를 화면 문구로 바꾼다 */
export function signupErrorFromDb(message: string): { field: SignupField; message: string } | "profile_exists" {
  if (message.includes("profile_exists")) return "profile_exists";
  if (message.includes("handle_taken")) return { field: "handle", message: "이미 쓰고 있는 핸들이에요." };
  if (message.includes("handle_reserved")) return { field: "handle", message: "쓸 수 없는 핸들이에요." };
  if (message.includes("handle_invalid")) {
    return { field: "handle", message: "영문 소문자 · 숫자 · _ 로 3~20자를 입력해 주세요." };
  }
  if (message.includes("under_14")) {
    return { field: "birthDate", message: `만 ${MIN_AGE}세 이상부터 가입할 수 있어요.` };
  }
  if (message.includes("birth_date_invalid")) return { field: "birthDate", message: "생년월일을 확인해 주세요." };
  if (message.includes("display_name_invalid")) return { field: "displayName", message: "표시 이름을 확인해 주세요." };
  if (message.includes("signup_closed")) return { field: "form", message: "지금은 가입을 잠시 멈췄어요. 조금 뒤에 다시 시도해 주세요." };
  return { field: "form", message: "가입을 마치지 못했어요. 잠시 뒤 다시 시도해 주세요." };
}

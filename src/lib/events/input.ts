import { z } from "zod";
import { REGIONS } from "./calendar";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜를 골라 주세요.");

export const eventSchema = z
  .object({
    name: z.string().trim().min(1, "행사 이름을 적어 주세요.").max(80),
    startsOn: date,
    endsOn: date,
    venue: z.string().trim().min(1, "장소를 적어 주세요.").max(80),
    region: z.enum(REGIONS),
    url: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "https:// 로 시작하는 주소만 넣을 수 있어요.")
      .transform((v) => v || null),
    description: z.string().trim().max(2000).default(""),
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ["endsOn"], message: "끝나는 날은 시작하는 날 이후여야 해요." })
  .refine((v) => (Date.parse(v.endsOn) - Date.parse(v.startsOn)) / 86_400_000 <= 31, {
    path: ["endsOn"],
    message: "행사 기간은 한 달까지예요.",
  });

export function eventErrorMessage(message: string | undefined): string {
  if (message?.includes("event_proposal_limit")) return "검토를 기다리는 제안이 5건 있어요. 결과가 나온 뒤 다시 제안해 주세요.";
  if (message?.includes("event_past")) return "이미 끝난 행사는 제안할 수 없어요.";
  if (message?.includes("member_suspended")) return "이용이 제한된 기간이에요.";
  if (message?.includes("site_read_only")) return "지금은 보기만 할 수 있어요.";
  if (message?.includes("duplicate key")) return "같은 주소의 태그가 이미 있어요. 태그 주소를 바꿔 주세요.";
  return "저장하지 못했어요.";
}

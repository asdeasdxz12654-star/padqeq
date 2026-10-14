import { z } from "zod";
import { Constants } from "@/lib/supabase/database.types";

export const inquirySchema = z.object({
  category: z.enum(Constants.public.Enums.inquiry_category),
  body: z.string().trim().min(5, "5자 이상 적어 주세요.").max(2000, "2000자까지 적을 수 있어요."),
  errorRef: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .nullable()
    .catch(null),
});

export const noticeSchema = z
  .object({
    id: z.uuid().nullable(),
    category: z.enum(Constants.public.Enums.notice_category),
    title: z.string().trim().min(1, "제목을 적어 주세요.").max(80),
    body: z.string().trim().min(1, "내용을 적어 주세요.").max(5000),
    /** 점검 시작 (KST, datetime-local 값 "YYYY-MM-DDTHH:mm") */
    maintenanceAt: z.string().nullable(),
    pinned: z.boolean(),
  })
  .transform((v, ctx) => {
    if (v.category !== "maintenance") return { ...v, maintenanceAt: null };
    const iso = v.maintenanceAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.maintenanceAt) ? `${v.maintenanceAt}:00+09:00` : null;
    if (!iso || Number.isNaN(Date.parse(iso))) {
      ctx.addIssue({ code: "custom", path: ["maintenanceAt"], message: "점검 시작 시각을 정해 주세요." });
      return z.NEVER;
    }
    return { ...v, maintenanceAt: new Date(iso).toISOString() };
  });

export function inquiryErrorMessage(message: string | undefined): string {
  if (message?.includes("inquiry_open_limit")) return "답변을 기다리는 문의가 5건 있어요. 답변을 받은 뒤 다시 남겨 주세요.";
  if (message?.includes("inquiry_rate_limited")) return "오늘은 문의를 더 남길 수 없어요. 내일 다시 시도해 주세요.";
  return "문의를 남기지 못했어요. 잠시 뒤 다시 시도해 주세요.";
}

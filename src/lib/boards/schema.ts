import { z } from "zod";
import { REGIONS } from "@/lib/events/calendar";
import { Constants } from "@/lib/supabase/database.types";
import { BOARDS } from "./labels";

// 게시판 글 · 섭외 양식 입력 규칙 (서버에서 확인)

const text = (max: number, label: string) => z.string().trim().min(1, `${label}을 적어 주세요.`).max(max);

export const boardPostSchema = z
  .object({
    board: z.enum(BOARDS),
    title: text(80, "제목"),
    body: text(5000, "내용"),
    region: z.enum(REGIONS).nullable(),
    castingKind: z.enum(Constants.public.Enums.casting_kind).nullable(),
    castingTerms: z.enum(Constants.public.Enums.casting_terms).nullable(),
    shootOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .catch(null),
  })
  .superRefine((v, ctx) => {
    if (v.board === "casting") {
      if (!v.castingKind) ctx.addIssue({ code: "custom", path: ["castingKind"], message: "분류를 골라 주세요." });
      if (!v.castingTerms) ctx.addIssue({ code: "custom", path: ["castingTerms"], message: "조건을 골라 주세요." });
    }
    if ((v.board === "casting" || v.board === "places") && !v.region) {
      ctx.addIssue({ code: "custom", path: ["region"], message: "지역을 골라 주세요." });
    }
  })
  .transform((v) =>
    v.board === "casting" ? v : { ...v, castingKind: null, castingTerms: null, shootOn: v.board === "places" ? null : v.shootOn },
  );

export const castingFormSchema = z.object({
  date: text(100, "날짜"),
  place: text(100, "장소"),
  concept: z.string().trim().max(100).default(""),
  terms: text(100, "조건"),
  usage: text(100, "결과물 사용 범위"),
  credit: z.string().trim().max(100).default(""),
});
export type CastingForm = z.infer<typeof castingFormSchema>;

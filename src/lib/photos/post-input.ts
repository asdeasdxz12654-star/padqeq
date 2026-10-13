import { z } from "zod";
import { currentYearKst, MIN_YEAR } from "@/lib/year-chips";
import { isPanorama, VARIANTS, variantSize } from "./variants";

// 업로드 화면(A-02 / S-08) 입력 규칙. 최종 판단은 DB 제약 · RLS · 서버 검사가 한다.

export const MAX_PHOTOS_PER_POST = 20;
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;

export const CATEGORIES = ["cosplay", "model", "landscape", "other"] as const;
export const CATEGORY_LABEL: Record<(typeof CATEGORIES)[number], string> = {
  cosplay: "코스프레",
  model: "모델 · 인물",
  landscape: "풍경",
  other: "기타",
};

/** 브라우저에서 만든 마스터의 정보. 마스터 규격(긴 변 4000 · 파노라마 예외)을 이미 지켜야 한다. */
const masterPhoto = z
  .object({
    width: z.int().positive(),
    height: z.int().positive(),
    bytes: z.int().positive(),
    takenAt: z.iso.datetime({ offset: true }).nullable(),
    altText: z.string().trim().max(300).default(""),
    /** 보이지 않는 워터마크 열쇠 (브라우저가 변환하며 만든 16바이트) */
    watermarkSeed: z.string().regex(/^[0-9a-f]{32}$/),
  })
  .refine(({ width, height }) => {
    const master = variantSize(width, height, "4000");
    return master.width === width && master.height === height;
  }, "마스터 크기 규칙을 벗어났어요")
  .refine(
    ({ width, height, bytes }) =>
      bytes <= (isPanorama(width, height) ? VARIANTS["4000"].panoramaMaxBytes : VARIANTS["4000"].maxBytes),
    "마스터 용량이 너무 커요",
  );

export const draftSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(80, "제목은 80자까지예요."),
  body: z.string().trim().max(2000, "설명은 2000자까지예요.").default(""),
  category: z.enum(CATEGORIES, { error: "카테고리를 골라 주세요." }),
  shotYear: z
    .int()
    .min(MIN_YEAR, "촬영 연도를 확인해 주세요.")
    .refine((y) => y <= currentYearKst(), "촬영 연도를 확인해 주세요."),
  shotOn: z.iso.date().nullable(),
  hasPeople: z.boolean(),
  photos: z.array(masterPhoto).min(1, "사진을 1장 이상 넣어 주세요.").max(MAX_PHOTOS_PER_POST),
  tagIds: z.array(z.uuid()).max(10, "태그는 10개까지예요.").default([]),
});
export type DraftInput = z.input<typeof draftSchema>;

/** 촬영 동의 기록 (비공개, 운영자만 열람) */
export const consentSchema = z
  .object({
    subjectLabel: z.string().trim().min(1, "사진 속 인물을 적어 주세요.").max(60),
    consentedOn: z.iso.date({ error: "동의한 날짜를 입력해 주세요." }),
    note: z.string().trim().max(500).default(""),
    hasMinor: z.boolean(),
    guardianConsent: z.boolean(),
  })
  .refine((c) => !c.hasMinor || c.guardianConsent, {
    error: "미성년자가 있으면 보호자 동의가 필요해요.",
    path: ["guardianConsent"],
  });
export type ConsentInput = z.input<typeof consentSchema>;

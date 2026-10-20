import { z } from "zod";
import { VEIL_REASONS } from "./veil-reasons";

export { VEIL_LABEL, VEIL_REASONS, type VeilReason, veilFor } from "./veil-reasons";

/** 업로드 · 편집 입력: 고르지 않으면 null */
export const veilInput = z.enum(VEIL_REASONS).nullable().default(null);

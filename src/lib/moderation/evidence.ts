// 신고 증거 사진 (S-15 ⑦). 규칙은 DB(add_report_evidence)와 같게 둔다.
//  · 파일 내용(앞부분 바이트)으로 형식을 판별한다. 확장자 · 브라우저가 붙인 Content-Type은 믿지 않는다.
//  · 증거는 원본임을 보여 주는 데 쓰이므로 사진 정보(EXIF)를 지우지 않는다. 운영자만 연다.

export const EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const MAX_EVIDENCE_FILES = 3;
/** 증거를 붙일 수 있는 신고 사유 (S-14 ⑦) */
export const EVIDENCE_REASONS = ["portrait_rights", "copyright"] as const;
export const acceptsEvidence = (reason: string | null) => (EVIDENCE_REASONS as readonly string[]).includes(reason ?? "");
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
/** 파일 고르기 창. 아이폰은 HEIC를 여기 맞춰 JPEG로 바꿔 준다. */
export const EVIDENCE_ACCEPT = EVIDENCE_TYPES.join(",");

export const isEvidenceType = (type: string): type is EvidenceType => (EVIDENCE_TYPES as readonly string[]).includes(type);

/** 파일 앞부분으로 형식 판별 */
export function sniffEvidence(buffer: ArrayBuffer): EvidenceType | null {
  const b = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...b.subarray(start, end));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/** DB 저장 키(e/{토큰}) → R2 경로(evidence/{토큰}). 형식이 다르면 null */
export function evidenceObjectKey(storageKey: string): string | null {
  const match = /^e\/([0-9a-f]{32})$/.exec(storageKey);
  return match ? `evidence/${match[1]}` : null;
}

/** 고른 파일 중 올릴 수 없는 것의 이유 (없으면 null) */
export function evidenceFileProblem(file: { name: string; type: string; size: number }): string | null {
  if (!isEvidenceType(file.type)) return `${file.name}: JPEG · PNG · WebP 사진만 올릴 수 있어요`;
  if (file.size <= 0 || file.size > MAX_EVIDENCE_BYTES) return `${file.name}: 10MB까지 올릴 수 있어요`;
  return null;
}

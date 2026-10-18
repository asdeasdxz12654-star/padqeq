// 색감 (photos.tone, DB가 대표 색에서 정한다). 탐색 › 색감으로 찾기.

export const TONES = ["warm", "cool", "pastel", "mono", "dark"] as const;
export type Tone = (typeof TONES)[number];

export const TONE_LABEL: Record<Tone, string> = { warm: "따뜻한", cool: "차가운", pastel: "파스텔", mono: "흑백", dark: "어두운" };

/** 칩 앞의 작은 색 점 */
export const TONE_SWATCH: Record<Tone, string> = { warm: "#d9643a", cool: "#2a6fb8", pastel: "#f4d6e0", mono: "#9a9a9a", dark: "#1c1c1c" };

export function parseTone(raw: unknown): Tone | null {
  return typeof raw === "string" && (TONES as readonly string[]).includes(raw) ? (raw as Tone) : null;
}

// 행사 코스 목록 (S-12 ③): 참가자가 미리 밝힌 캐릭터를 모아 현장에서 서로 찾기 쉽게.
// 코스 메모는 자유 입력이라 쉼표 · 슬래시 · 가운뎃점으로 나누고, 대소문자 · 띄어쓰기 차이는 같은 캐릭터로 본다.

export type CosEntry = { name: string; handles: string[] };

const split = (note: string) =>
  note
    .normalize("NFC")
    .split(/[,/·、，]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0 && s.length <= 40);

export function cosList(attendees: { handle: string; cosNote: string }[]): CosEntry[] {
  const byKey = new Map<string, CosEntry>();
  for (const a of attendees) {
    for (const name of new Set(split(a.cosNote))) {
      const key = name.toLowerCase().replace(/\s/g, "");
      const entry = byKey.get(key) ?? { name, handles: [] };
      if (!entry.handles.includes(a.handle)) entry.handles.push(a.handle);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((x, y) => y.handles.length - x.handles.length || x.name.localeCompare(y.name, "ko"));
}

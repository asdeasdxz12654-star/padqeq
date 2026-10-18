// 팔로우 피드 묶기: 한 작가가 한꺼번에 올린 글이 이어지면 앞의 몇 장만 보이고 나머지는 "새 사진 N장 더"로 접는다.
// 피드가 한 사람으로 도배되지 않게.

export type Fold = { start: string; handle: string; hidden: number };

/**
 * 같은 핸들이 min개 이상 이어지면 keep개만 남긴다. opened에 그 묶음의 첫 글 id가 있으면 펼친 채로.
 * folds: 묶음에서 마지막으로 보이는 글 id → 접힌 정보 (그 뒤에 '더 보기' 칸을 둔다).
 */
export function foldRuns<T extends { id: string; handle: string }>(items: T[], opened: ReadonlySet<string>, min = 5, keep = 3) {
  const visible: T[] = [];
  const folds = new Map<string, Fold>();
  for (let i = 0; i < items.length; ) {
    let j = i;
    while (j < items.length && items[j]!.handle === items[i]!.handle) j++;
    const run = items.slice(i, j);
    if (run.length >= min && !opened.has(run[0]!.id)) {
      visible.push(...run.slice(0, keep));
      folds.set(run[keep - 1]!.id, { start: run[0]!.id, handle: run[0]!.handle, hidden: run.length - keep });
    } else visible.push(...run);
    i = j;
  }
  return { visible, folds };
}

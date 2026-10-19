// 사진 피드 메이슨리: 차례대로 가장 짧은 열에 넣는다 (왼쪽 → 오른쪽 순서가 지켜지고, 뒤에 더 불러와도 앞의 자리는 그대로).
// 높이는 열 너비를 1로 본 비율로 어림한다 (사진 비율 + 아래 글 줄 + 덧붙인 칸).

export type MasonryEntry<T> = { item: T; index: number };

export function masonryColumns<T>(items: T[], count: number, heightOf: (item: T) => number): MasonryEntry<T>[][] {
  const columns: MasonryEntry<T>[][] = Array.from({ length: Math.max(1, count) }, () => []);
  const heights = columns.map(() => 0);
  items.forEach((item, index) => {
    // 높이가 같으면 왼쪽 열부터
    let target = 0;
    for (let c = 1; c < columns.length; c++) if (heights[c]! < heights[target]! - 1e-9) target = c;
    columns[target]!.push({ item, index });
    heights[target]! += heightOf(item);
  });
  return columns;
}

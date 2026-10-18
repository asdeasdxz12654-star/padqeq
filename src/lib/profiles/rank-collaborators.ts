// 함께한 사람: 같은 게시물에 올린 사람 · 승인된 크레딧으로 함께 이름이 오른 회원을 글 수로 센다.

export type Pairing = { postId: string; handle: string; displayName: string };
export type Collaborator = { handle: string; displayName: string; posts: number };

/** 한 게시물에서 같은 사람은 한 번만. 많이 함께한 순 → 핸들 순, 나는 빼고. */
export function rankCollaborators(pairs: Pairing[], selfHandle: string, max = 8): Collaborator[] {
  const seen = new Set<string>();
  const counts = new Map<string, Collaborator>();
  for (const p of pairs) {
    if (p.handle === selfHandle || seen.has(`${p.postId}:${p.handle}`)) continue;
    seen.add(`${p.postId}:${p.handle}`);
    const c = counts.get(p.handle) ?? { handle: p.handle, displayName: p.displayName, posts: 0 };
    c.posts += 1;
    counts.set(p.handle, c);
  }
  return [...counts.values()].toSorted((a, b) => b.posts - a.posts || a.handle.localeCompare(b.handle)).slice(0, max);
}

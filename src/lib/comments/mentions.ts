// 댓글 본문의 @멘션을 링크로 보여 주기 위해 나눈다. 알림 대상은 DB 트리거가 같은 규칙으로 정한다.
export type Segment = { kind: "text"; text: string } | { kind: "mention"; handle: string; text: string };

const MENTION = /@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/g;

export function splitMentions(body: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(MENTION)) {
    const start = match.index;
    // 이메일 주소(a@b) 안의 @는 멘션이 아니다
    if (start > 0 && /[A-Za-z0-9._%+-]/.test(body[start - 1]!)) continue;
    if (start > last) segments.push({ kind: "text", text: body.slice(last, start) });
    segments.push({ kind: "mention", handle: match[1]!.toLowerCase(), text: match[0] });
    last = start + match[0].length;
  }
  if (last < body.length) segments.push({ kind: "text", text: body.slice(last) });
  return segments;
}

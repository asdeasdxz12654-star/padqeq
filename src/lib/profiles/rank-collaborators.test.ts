import { describe, expect, it } from "vitest";
import { rankCollaborators } from "./rank-collaborators";

const pair = (postId: string, handle: string) => ({ postId, handle, displayName: handle.toUpperCase() });

describe("rankCollaborators", () => {
  it("글 수로 세고 나는 뺀다", () => {
    const ranked = rankCollaborators([pair("p1", "a"), pair("p2", "a"), pair("p1", "b"), pair("p1", "me")], "me");
    expect(ranked).toEqual([
      { handle: "a", displayName: "A", posts: 2 },
      { handle: "b", displayName: "B", posts: 1 },
    ]);
  });
  it("한 글에 두 번 올라도 한 번", () => {
    expect(rankCollaborators([pair("p1", "a"), pair("p1", "a")], "me")[0]?.posts).toBe(1);
  });
  it("같은 수면 핸들 순, 최대 개수", () => {
    expect(rankCollaborators([pair("p1", "c"), pair("p1", "b"), pair("p1", "a")], "me", 2).map((c) => c.handle)).toEqual(["a", "b"]);
  });
});

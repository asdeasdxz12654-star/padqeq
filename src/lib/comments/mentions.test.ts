import { describe, expect, it } from "vitest";
import { splitMentions } from "./mentions";

describe("splitMentions", () => {
  it("멘션과 글을 나눈다", () => {
    expect(splitMentions("와 @Model_A 님 최고")).toEqual([
      { kind: "text", text: "와 " },
      { kind: "mention", handle: "model_a", text: "@Model_A" },
      { kind: "text", text: " 님 최고" },
    ]);
  });

  it("짧거나 이메일 속 @는 멘션이 아니다", () => {
    expect(splitMentions("@ab 와 me@mail.com")).toEqual([{ kind: "text", text: "@ab 와 me@mail.com" }]);
  });

  it("너무 긴 핸들은 멘션이 아니다", () => {
    expect(splitMentions(`@${"a".repeat(21)}`)).toEqual([{ kind: "text", text: `@${"a".repeat(21)}` }]);
  });
});

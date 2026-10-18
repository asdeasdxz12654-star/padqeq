import { describe, expect, it } from "vitest";
import { parseTone } from "./tone";

describe("parseTone", () => {
  it("정해진 색감만", () => {
    expect(parseTone("warm")).toBe("warm");
    expect(parseTone("red")).toBeNull();
    expect(parseTone(["warm"])).toBeNull();
  });
});

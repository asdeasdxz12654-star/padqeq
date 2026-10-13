import { describe, expect, it } from "vitest";
import { cleanTagName, parseAliases, tagSlug } from "./tag-rules";

describe("태그 주소 · 이름", () => {
  it("공백은 '-', 영문은 소문자, 한글 · 일본어는 그대로", () => {
    expect(tagSlug("라이덴 쇼군")).toBe("라이덴-쇼군");
    expect(tagSlug("  Blue   Archive ")).toBe("blue-archive");
    expect(tagSlug("雷電将軍")).toBe("雷電将軍");
  });

  it("주소에서 문제가 되는 문자는 뺀다", () => {
    expect(tagSlug("Fate/Grand Order")).toBe("fategrand-order");
    expect(tagSlug("A&B + C.D?#%")).toBe("ab-cd");
    expect(tagSlug("--- ? ---")).toBe("");
  });

  it("전각 문자는 반각으로 (NFKC)", () => {
    expect(cleanTagName("ＡＢＣ　１")).toBe("ABC 1");
  });

  it("별칭: 쉼표로 나누고 이름 · 중복 제거", () => {
    expect(parseAliases("Raiden Shogun, 雷電将軍, raiden shogun, 라이덴 쇼군", "라이덴 쇼군")).toEqual([
      "Raiden Shogun",
      "雷電将軍",
    ]);
  });
});

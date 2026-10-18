import { describe, expect, it } from "vitest";
import { GUIDE } from "./guide";

describe("이용 가이드", () => {
  it("id는 겹치지 않는다 (/guide#id 링크가 가리키는 곳)", () => {
    const ids = GUIDE.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id는 주소에 그대로 쓸 수 있는 글자만 쓴다", () => {
    for (const { id } of GUIDE) expect(id).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("링크는 모두 해담 안의 경로다 (외부로 내보내지 않는다)", () => {
    for (const { links } of GUIDE) {
      for (const { href } of links ?? []) {
        expect(href.startsWith("/")).toBe(true);
        expect(href.startsWith("//")).toBe(false);
      }
    }
  });

  it("비어 있는 항목이 없다", () => {
    for (const { q, a, links } of GUIDE) {
      expect(q.length).toBeGreaterThan(0);
      expect(a.length).toBeGreaterThan(0);
      for (const { label } of links ?? []) expect(label.length).toBeGreaterThan(0);
    }
  });

  it("업로드가 아직 열리지 않았다는 안내와 크레딧 설명이 들어 있다", () => {
    expect(GUIDE.some((item) => item.id === "upload")).toBe(true);
    expect(GUIDE.some((item) => item.id === "credits")).toBe(true);
  });
});

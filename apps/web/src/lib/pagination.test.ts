import { describe, expect, it } from "vitest";
import { parsePagination, paginatedMeta } from "@/lib/pagination";

describe("pagination", () => {
  it("sayfa ve offset hesaplar", () => {
    const url = new URL("http://localhost/api?sayfa=3&limit=25");
    const p = parsePagination(url);
    expect(p.sayfa).toBe(3);
    expect(p.limit).toBe(25);
    expect(p.offset).toBe(50);
  });

  it("hasMore doğru", () => {
    const meta = paginatedMeta([1, 2], { sayfa: 1, limit: 2, offset: 0, totalCount: 5 });
    expect(meta.hasMore).toBe(true);
    expect(meta.items).toEqual([1, 2]);
  });
});

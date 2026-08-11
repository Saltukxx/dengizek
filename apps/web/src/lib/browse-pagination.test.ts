import { describe, expect, it } from "vitest";
import { BROWSE_PAGE_SIZE, pageWindow, paginate } from "@/lib/browse-pagination";

const items = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginate", () => {
  it("ilk sayfa varsayılan olarak döner", () => {
    const r = paginate(items(30), undefined);
    expect(r.currentPage).toBe(1);
    expect(r.totalPages).toBe(3);
    expect(r.totalCount).toBe(30);
    expect(r.items).toHaveLength(BROWSE_PAGE_SIZE);
    expect(r.items[0]).toBe(1);
  });

  it("istenen sayfanın dilimini verir", () => {
    const r = paginate(items(30), "2");
    expect(r.currentPage).toBe(2);
    expect(r.items[0]).toBe(13);
    expect(r.items.at(-1)).toBe(24);
  });

  it("son sayfa eksik dolabilir", () => {
    const r = paginate(items(25), "3");
    expect(r.items).toEqual([25]);
  });

  it("aralık dışı sayfa son sayfaya kelepçelenir", () => {
    // Filtre daraldıktan sonra ?sayfa=9 ile gelen bağlantı boş liste
    // göstermemeli.
    const r = paginate(items(5), "9");
    expect(r.currentPage).toBe(1);
    expect(r.items).toHaveLength(5);
  });

  it("bozuk sayfa parametresi 1'e düşer", () => {
    expect(paginate(items(30), "abc").currentPage).toBe(1);
    expect(paginate(items(30), "-4").currentPage).toBe(1);
  });

  it("boş listede tek sayfa vardır", () => {
    const r = paginate([], "2");
    expect(r.totalPages).toBe(1);
    expect(r.items).toEqual([]);
  });
});

describe("pageWindow", () => {
  it("kısa listelerde tüm sayfaları verir", () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("uzun listelerde araya boşluk koyar", () => {
    expect(pageWindow(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
  });

  it("baştayken yalnızca sonda boşluk olur", () => {
    expect(pageWindow(1, 12)).toEqual([1, 2, "gap", 12]);
  });

  it("sondayken yalnızca başta boşluk olur", () => {
    expect(pageWindow(12, 12)).toEqual([1, "gap", 11, 12]);
  });
});

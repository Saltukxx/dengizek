// ---------------------------------------------------------------------------
// Keşfet listesi sayfalama yardımcıları.
//
// Sayfalama filtre ve sıralamadan SONRA uygulanır: yıldız/olanak/fiyat
// filtreleri snapshot'tan türeyen alanlar üzerinde JS'te çalıştığı için
// toplam sayı ancak süzme bittiğinde kesinleşir.
// ---------------------------------------------------------------------------

/** Sayfa başına tesis — ızgara 3 kolonda tam sıra verir. */
export const BROWSE_PAGE_SIZE = 12;

export interface BrowsePage<T> {
  items: T[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

/**
 * Sayfa dilimini hesaplar. Aralık dışı istek (ör. filtre daraldıktan sonra
 * ?sayfa=9) boş sayfa göstermek yerine son sayfaya kelepçelenir.
 */
export function paginate<T>(
  items: T[],
  requestedPage: unknown,
  pageSize = BROWSE_PAGE_SIZE,
): BrowsePage<T> {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const parsed = Number(requestedPage ?? 1);
  const currentPage = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(parsed) ? Math.floor(parsed) : 1),
  );
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    currentPage,
    totalPages,
    totalCount,
  };
}

/** 1 … n arası sayfa numaraları; uzun listelerde aradan "…" ile kırpar. */
export function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}

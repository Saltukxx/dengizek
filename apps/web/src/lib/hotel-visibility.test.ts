// ---------------------------------------------------------------------------
// Misafir görünürlük şartı testleri — üretilen SQL'in şeklini doğrular.
// (drizzle .toSQL() canlı bağlantı gerektirmez.)
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { hotelsTable } from "@/lib/db/schema";
import { guestVisibleHotelBySlugWhere, guestVisibleHotelWhere } from "@/lib/hotel-visibility";

const db = drizzle({} as never);

function sqlFor(where: ReturnType<typeof guestVisibleHotelWhere>) {
  return db.select().from(hotelsTable).where(where).toSQL().sql;
}

describe("guestVisibleHotelWhere", () => {
  const sql = sqlFor(guestVisibleHotelWhere());

  it("yayınlanmış snapshot'ı olan tesisi görünür sayar", () => {
    expect(sql).toContain('"published_snapshot" is not null');
  });

  it("snapshot'ı olmayan eski kayıtlar için status='yayinda' kolunu korur", () => {
    expect(sql).toContain('"status" = ');
    expect(sql).toContain(" or ");
  });

  it("askıya alınmış tesisi her durumda gizler", () => {
    expect(sql).toContain('"suspended_at" is null');
  });

  it("status'ü TEK BAŞINA zorunlu kılmaz — aksi halde inceleme sırasında tesis düşer", () => {
    // status koşulu yalnızca OR'un bir kolu olmalı; AND'e bağlanmamalı.
    const [beforeSuspend] = sql.split('"suspended_at" is null');
    expect(beforeSuspend).toContain(" or ");
  });
});

describe("guestVisibleHotelBySlugWhere", () => {
  const sql = sqlFor(guestVisibleHotelBySlugWhere("aurelia-bay"));

  it("slug eşleşmesini görünürlük şartıyla birlikte uygular", () => {
    expect(sql).toContain('"slug" = ');
    expect(sql).toContain('"published_snapshot" is not null');
    expect(sql).toContain('"suspended_at" is null');
  });
});

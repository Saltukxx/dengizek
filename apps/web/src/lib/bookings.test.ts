import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";

// withTransaction'ı sahte bir tx ile çalıştır — gerçek DB gerekmez.
const txRows = { rooms: [] as unknown[], bookings: [] as unknown[] };
const insertedValues = vi.fn();
const restoreCalls = vi.fn();

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
}));

/** where() hem await edilebilir hem de .limit() zincirlenebilir olmalı. */
function whereResult(rows: unknown[]) {
  const p = Promise.resolve(rows) as Promise<unknown[]> & {
    limit: (n: number) => Promise<unknown[]>;
    for: (mode: string) => Promise<unknown[]>;
  };
  p.limit = async () => rows;
  p.for = async () => rows;
  return p;
}

function makeTx() {
  return {
    select: () => ({
      from: (table: Table) => ({
        where: () =>
          whereResult(getTableName(table) === "rooms" ? txRows.rooms : txRows.bookings),
      }),
    }),
    insert: () => ({
      values: (v: unknown) => ({
        returning: async () => {
          insertedValues(v);
          return [{ id: "b1", ...(v as object) }];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => {
            restoreCalls();
            return [{ id: "inv" }];
          },
        }),
      }),
    }),
  };
}

import { BookingServiceError, createPendingBooking } from "@/lib/bookings";

const room = { id: "room-1", capacityAdults: 2, capacityChildren: 1 };

const baseInput = {
  roomId: "room-1",
  guestName: "Ada",
  guestEmail: "ada@example.com",
  checkIn: "2026-08-01",
  checkOut: "2026-08-05",
  adults: 2,
  children: 0,
};

beforeEach(() => {
  txRows.rooms = [room];
  txRows.bookings = [];
  insertedValues.mockReset();
  restoreCalls.mockReset();
});

describe("BookingServiceError", () => {
  it("kod taşır", () => {
    const err = new BookingServiceError("test", "overlap");
    expect(err.code).toBe("overlap");
    expect(err.message).toBe("test");
  });

  it("envanter kodu overlap'ten ayrılır", () => {
    const err = new BookingServiceError("envanter kaydı yok", "inventory");
    expect(err.code).toBe("inventory");
  });
});

describe("createPendingBooking", () => {
  it("müsait odada beklemede rezervasyon oluşturur", async () => {
    const booking = await createPendingBooking("hotel-1", baseInput);
    expect(booking).toMatchObject({ status: "beklemede", hotelId: "hotel-1" });
    expect(insertedValues).toHaveBeenCalledOnce();
  });

  it("oda otelе ait değilse not_found fırlatır", async () => {
    txRows.rooms = [];
    await expect(createPendingBooking("hotel-1", baseInput)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("çakışan aktif rezervasyon varsa overlap fırlatır", async () => {
    txRows.bookings = [
      {
        id: "b0",
        roomId: "room-1",
        status: "onaylandi",
        checkIn: "2026-08-03",
        checkOut: "2026-08-08",
      },
    ];
    await expect(createPendingBooking("hotel-1", baseInput)).rejects.toMatchObject({
      code: "overlap",
    });
    expect(insertedValues).not.toHaveBeenCalled();
  });

  it("bitişik (çakışmayan) tarihlere izin verir", async () => {
    txRows.bookings = [
      {
        id: "b0",
        roomId: "room-1",
        status: "onaylandi",
        checkIn: "2026-08-05",
        checkOut: "2026-08-09",
      },
    ];
    await expect(createPendingBooking("hotel-1", baseInput)).resolves.toBeTruthy();
  });

  it("yetişkin kapasitesi aşılırsa invalid_state fırlatır", async () => {
    await expect(
      createPendingBooking("hotel-1", { ...baseInput, adults: 5 }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("çocuk kapasitesi aşılırsa invalid_state fırlatır", async () => {
    await expect(
      createPendingBooking("hotel-1", { ...baseInput, children: 3 }),
    ).rejects.toMatchObject({ code: "invalid_state" });
  });

  it("oda seçilmemişse kapasite/çakışma kontrolü yapmaz", async () => {
    txRows.bookings = [
      { id: "b0", roomId: null, status: "onaylandi", checkIn: "2026-08-01", checkOut: "2026-08-09" },
    ];
    await expect(
      createPendingBooking("hotel-1", { ...baseInput, roomId: null, adults: 9 }),
    ).resolves.toBeTruthy();
  });

  it("birden çok birimli oda tipinde birimler dolana kadar çakışan rezervasyon alır", async () => {
    txRows.rooms = [{ ...room, unitCount: 2 }];
    const taken = { roomId: "room-1", status: "onaylandi", checkIn: "2026-08-03", checkOut: "2026-08-08" };
    txRows.bookings = [{ id: "b0", ...taken }];
    await expect(createPendingBooking("hotel-1", baseInput)).resolves.toBeTruthy();

    txRows.bookings = [{ id: "b0", ...taken }, { id: "b1", ...taken }];
    await expect(createPendingBooking("hotel-1", baseInput)).rejects.toMatchObject({
      code: "overlap",
      message: expect.stringContaining("2026-08-03"),
    });
  });

  it("aynı gecede çakışmayan iki ayrı rezervasyonu doluluk saymaz", async () => {
    txRows.rooms = [{ ...room, unitCount: 2 }];
    // Biri 1–3, diğeri 3–5: hiçbir gecede aynı anda iki birim dolmaz.
    txRows.bookings = [
      { id: "b0", roomId: "room-1", status: "onaylandi", checkIn: "2026-08-01", checkOut: "2026-08-03" },
      { id: "b1", roomId: "room-1", status: "onaylandi", checkIn: "2026-08-03", checkOut: "2026-08-05" },
    ];
    await expect(createPendingBooking("hotel-1", baseInput)).resolves.toBeTruthy();
  });
});

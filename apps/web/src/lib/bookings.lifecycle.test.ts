import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";

const state = vi.hoisted(() => ({
  selectRows: new Map<string, unknown[][]>(),
  updates: [] as Array<{ table: string; values: Record<string, unknown> }>,
  inserts: [] as Array<{ table: string; values: Record<string, unknown> }>,
}));

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeTx()),
}));

function tableName(table: Table) {
  return getTableName(table);
}

function nextRows(table: Table) {
  return state.selectRows.get(tableName(table))?.shift() ?? [];
}

function selectable(rows: unknown[]) {
  const result = Promise.resolve(rows) as Promise<unknown[]> & {
    limit: () => Promise<unknown[]>;
    for: () => Promise<unknown[]>;
  };
  result.limit = vi.fn(async () => rows);
  result.for = vi.fn(async () => rows);
  return result;
}

function makeTx() {
  return {
    select: () => ({
      from: (table: Table) => ({
        where: () => selectable(nextRows(table)),
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push({ table: tableName(table), values });
        return {
          where: () => ({
            returning: async () => [{ id: `${tableName(table)}-updated`, ...values }],
          }),
        };
      },
    }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown>) => {
        state.inserts.push({ table: tableName(table), values });
        return {
          returning: async () => [{ id: `${tableName(table)}-inserted`, ...values }],
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
  };
}

import {
  approveBooking,
  BookingServiceError,
  recordStayStep,
  releaseApprovedBooking,
  reopenBooking,
} from "@/lib/bookings";

const booking = {
  id: "booking-1",
  hotelId: "hotel-1",
  roomId: "room-1",
  status: "beklemede",
  checkIn: "2026-12-10",
  checkOut: "2026-12-12",
};

function queue(table: string, ...rows: unknown[][]) {
  state.selectRows.set(table, rows);
}

function inventoryRow(overrides: Record<string, unknown> = {}) {
  return { allotment: 2, stopSell: false, cta: false, ctd: false, minStay: null, ...overrides };
}

describe("rezervasyon yaşam döngüsü", () => {
  beforeEach(() => {
    state.selectRows.clear();
    state.updates.length = 0;
    state.inserts.length = 0;
  });

  it("bekleyen rezervasyonu onaylarken her geceyi doğrular ve tam bir kez düşer", async () => {
    queue("bookings", [booking]);
    queue("rooms", [{ id: "room-1" }]);
    queue(
      "room_inventory",
      [inventoryRow()],
      [inventoryRow()],
      [inventoryRow({ ctd: false })],
    );

    const result = await approveBooking("hotel-1", "booking-1", "approve-key");

    expect(result).toMatchObject({ status: "onaylandi" });
    expect(state.updates.filter((entry) => entry.table === "room_inventory")).toHaveLength(2);
    expect(state.updates.filter((entry) => entry.table === "bookings")).toEqual([
      { table: "bookings", values: { status: "onaylandi", updatedAt: expect.any(Date) } },
    ]);
    expect(state.inserts).toContainEqual({
      table: "booking_transitions",
      values: {
        bookingId: "booking-1",
        hotelId: "hotel-1",
        action: "approve",
        idempotencyKey: "approve-key",
        fromStatus: "beklemede",
        toStatus: "onaylandi",
      },
    });
  });

  it("stop-sell gününde onayı hiçbir envanter veya durum yazımı yapmadan keser", async () => {
    queue("bookings", [booking]);
    queue("rooms", [{ id: "room-1" }]);
    queue("room_inventory", [inventoryRow({ stopSell: true })]);

    await expect(approveBooking("hotel-1", "booking-1")).rejects.toMatchObject({
      code: "inventory",
      message: expect.stringContaining("satış kapalı"),
    });
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it("minimum konaklama şartını onay anında yeniden doğrular", async () => {
    queue("bookings", [{ ...booking, checkOut: "2026-12-11" }]);
    queue("rooms", [{ id: "room-1" }]);
    queue("room_inventory", [inventoryRow({ minStay: 2 })]);

    await expect(approveBooking("hotel-1", "booking-1")).rejects.toMatchObject({
      code: "inventory",
      message: "Minimum konaklama 2 gecedir.",
    });
    expect(state.updates).toHaveLength(0);
  });

  it("zaten onaylı rezervasyonu idempotent döndürür ve envanteri tekrar düşmez", async () => {
    const approved = { ...booking, status: "onaylandi" };
    queue("bookings", [approved]);

    await expect(approveBooking("hotel-1", "booking-1", "retry-key")).resolves.toEqual(approved);
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it("iptalde iki gecelik envanteri geri verir ve geçişi kaydeder", async () => {
    queue("bookings", [{ ...booking, status: "onaylandi" }]);
    queue("payments", []);

    const result = await releaseApprovedBooking(
      "hotel-1",
      "booking-1",
      "iptal",
      "cancel-key",
    );

    expect(result).toMatchObject({ status: "iptal" });
    expect(state.updates.filter((entry) => entry.table === "room_inventory")).toHaveLength(2);
    expect(state.inserts).toContainEqual({
      table: "booking_transitions",
      values: expect.objectContaining({
        action: "cancel",
        idempotencyKey: "cancel-key",
        fromStatus: "onaylandi",
        toStatus: "iptal",
      }),
    });
  });

  it("no-show durumunda geçmiş envanteri geri vermez", async () => {
    queue("bookings", [{ ...booking, status: "onaylandi" }]);
    queue("payments", []);

    const result = await releaseApprovedBooking(
      "hotel-1",
      "booking-1",
      "no_show",
      "noshow-key",
    );

    expect(result).toMatchObject({ status: "no_show" });
    expect(state.updates.filter((entry) => entry.table === "room_inventory")).toHaveLength(0);
    expect(state.inserts).toContainEqual({
      table: "booking_transitions",
      values: expect.objectContaining({ action: "mark_no_show", toStatus: "no_show" }),
    });
  });

  it("zaten iptal edilmiş rezervasyonda idempotent kalır", async () => {
    const canceled = { ...booking, status: "iptal" };
    queue("bookings", [canceled]);

    await expect(
      releaseApprovedBooking("hotel-1", "booking-1", "iptal", "cancel-retry"),
    ).resolves.toEqual(canceled);
    expect(state.updates).toEqual([]);
    expect(state.inserts).toEqual([]);
  });

  it("no-show kaydını yeniden açarken yeniden onayda düşülecek envanteri dengeler", async () => {
    queue("bookings", [{ ...booking, status: "no_show" }]);
    queue("payments", []);

    const result = await reopenBooking("hotel-1", "booking-1", "reopen-key");

    expect(result).toMatchObject({ status: "beklemede" });
    expect(state.updates.filter((entry) => entry.table === "room_inventory")).toHaveLength(2);
    expect(state.inserts).toContainEqual({
      table: "booking_transitions",
      values: expect.objectContaining({
        action: "reopen",
        idempotencyKey: "reopen-key",
        fromStatus: "no_show",
        toStatus: "beklemede",
      }),
    });
  });

  it("terminal olmayan rezervasyonu yeniden açmayı reddeder", async () => {
    queue("bookings", [{ ...booking, status: "onaylandi" }]);

    await expect(reopenBooking("hotel-1", "booking-1", "reopen-key")).rejects.toBeInstanceOf(
      BookingServiceError,
    );
    expect(state.updates).toEqual([]);
  });

  describe("giriş / çıkış kaydı", () => {
    const approved = { ...booking, status: "onaylandi", checkedInAt: null, checkedOutAt: null };
    // Europe/Istanbul'da 10 Aralık öğlen — giriş günü.
    const onArrivalDay = new Date("2026-12-10T09:00:00Z");

    it("giriş gününde girişi damgalar, durumu ve envanteri değiştirmez", async () => {
      queue("bookings", [approved]);

      const result = await recordStayStep("hotel-1", "booking-1", "check_in", "in-key", onArrivalDay);

      expect(result).toMatchObject({ checkedInAt: onArrivalDay });
      expect(state.updates).toEqual([
        { table: "bookings", values: { checkedInAt: onArrivalDay, updatedAt: onArrivalDay } },
      ]);
      expect(state.inserts).toContainEqual({
        table: "booking_transitions",
        values: expect.objectContaining({
          action: "check_in",
          idempotencyKey: "in-key",
          fromStatus: "onaylandi",
          toStatus: "onaylandi",
        }),
      });
    });

    it("giriş tarihi gelmeden girişi reddeder", async () => {
      queue("bookings", [approved]);
      await expect(
        recordStayStep("hotel-1", "booking-1", "check_in", "early", new Date("2026-12-09T09:00:00Z")),
      ).rejects.toMatchObject({ code: "invalid_state" });
      expect(state.updates).toEqual([]);
    });

    it("onaylanmamış rezervasyonda giriş kaydetmez", async () => {
      queue("bookings", [booking]);
      await expect(
        recordStayStep("hotel-1", "booking-1", "check_in", "pending", onArrivalDay),
      ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("tekrarlanan girişte ilk damgayı korur", async () => {
      const already = { ...approved, checkedInAt: new Date("2026-12-10T08:00:00Z") };
      queue("bookings", [already]);
      await expect(
        recordStayStep("hotel-1", "booking-1", "check_in", "again", onArrivalDay),
      ).resolves.toEqual(already);
      expect(state.updates).toEqual([]);
      expect(state.inserts).toEqual([]);
    });

    it("giriş olmadan çıkışı reddeder; girişten sonra çıkışı damgalar", async () => {
      queue("bookings", [approved]);
      await expect(
        recordStayStep("hotel-1", "booking-1", "check_out", "out-1", onArrivalDay),
      ).rejects.toMatchObject({ code: "invalid_state" });

      queue("bookings", [{ ...approved, checkedInAt: onArrivalDay }]);
      const out = new Date("2026-12-12T07:00:00Z");
      await expect(
        recordStayStep("hotel-1", "booking-1", "check_out", "out-2", out),
      ).resolves.toMatchObject({ checkedOutAt: out });
    });

    it("çıkış kaydı dururken girişi geri almayı reddeder", async () => {
      queue("bookings", [{ ...approved, checkedInAt: onArrivalDay, checkedOutAt: onArrivalDay }]);
      await expect(
        recordStayStep("hotel-1", "booking-1", "undo_check_in", "undo", onArrivalDay),
      ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("girişi geri alınca damgayı siler", async () => {
      queue("bookings", [{ ...approved, checkedInAt: onArrivalDay }]);
      await recordStayStep("hotel-1", "booking-1", "undo_check_in", "undo", onArrivalDay);
      expect(state.updates).toEqual([
        { table: "bookings", values: { checkedInAt: null, updatedAt: onArrivalDay } },
      ]);
    });

    it("giriş yapmış rezervasyonu iptal etmez ve gelmedi işaretlemez", async () => {
      for (const target of ["iptal", "no_show"] as const) {
        queue("bookings", [{ ...approved, checkedInAt: onArrivalDay }]);
        await expect(
          releaseApprovedBooking("hotel-1", "booking-1", target, `${target}-key`),
        ).rejects.toMatchObject({ code: "invalid_state" });
      }
      expect(state.updates).toEqual([]);
    });
  });
});

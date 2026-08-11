import { beforeEach, describe, expect, it, vi } from "vitest";
import { hotelPanelRevisionsTable } from "@/lib/db/schema";

const withTransactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/transaction", () => ({
  withTransaction: (...args: unknown[]) => withTransactionMock(...args),
}));

import {
  PanelRevisionConflict,
  abortPanelMutation,
  panelRevisionConflictResponse,
  readExpectedRevision,
  runPanelMutation,
} from "@/lib/panel-revision";

function fakeTransaction({
  lockRows,
  currentRevision = 1,
}: {
  lockRows: Array<{ revision: number; updatedAt: Date; updatedBy: string | null }>;
  currentRevision?: number;
}) {
  const hotelUpdates: unknown[] = [];
  const tx = {
    insert: (table: unknown) => ({
      values: () => table === hotelPanelRevisionsTable
        ? { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }
        : Promise.resolve(undefined),
    }),
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => table === hotelPanelRevisionsTable
          ? { returning: vi.fn().mockResolvedValue(lockRows) }
          : Promise.resolve(hotelUpdates.push(values)),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([{
            revision: currentRevision,
            updatedAt: new Date("2026-08-11T00:00:00.000Z"),
            updatedBy: "user-2",
          }]),
        }),
      }),
    }),
  };
  return { tx, hotelUpdates };
}

beforeEach(() => {
  withTransactionMock.mockReset();
});

describe("panel revision input", () => {
  it("yalnızca pozitif tam sayı revizyonu kabul eder", () => {
    expect(readExpectedRevision({ expectedRevision: 3 })).toBe(3);
    expect(readExpectedRevision({ expectedRevision: 0 })).toBeNull();
    expect(readExpectedRevision({ expectedRevision: 1.5 })).toBeNull();
    expect(readExpectedRevision({ expectedRevision: "3" })).toBeNull();
  });
});

describe("runPanelMutation", () => {
  it("kilidi alır, mutasyonu çalıştırır ve yayın içeriğinde taslak sürümünü artırır", async () => {
    const { tx, hotelUpdates } = fakeTransaction({
      lockRows: [{ revision: 2, updatedAt: new Date(), updatedBy: "user-1" }],
    });
    withTransactionMock.mockImplementation((fn) => fn(tx));
    const mutate = vi.fn().mockResolvedValue("saved");

    const result = await runPanelMutation({
      hotelId: "hotel-1",
      scope: "rooms",
      expectedRevision: 1,
      updatedBy: "user-1",
      mutate,
    });

    expect(result).toEqual({ result: "saved", revision: 2 });
    expect(mutate).toHaveBeenCalledWith(tx);
    expect(hotelUpdates).toHaveLength(1);
  });

  it("envanter gibi operasyonel kapsamda otel taslak sürümünü artırmaz", async () => {
    const { tx, hotelUpdates } = fakeTransaction({
      lockRows: [{ revision: 2, updatedAt: new Date(), updatedBy: "user-1" }],
    });
    withTransactionMock.mockImplementation((fn) => fn(tx));

    await runPanelMutation({
      hotelId: "hotel-1",
      scope: "inventory",
      expectedRevision: 1,
      updatedBy: "user-1",
      mutate: async () => undefined,
    });

    expect(hotelUpdates).toHaveLength(0);
  });

  it("eski revizyonda içerik mutasyonunu hiç çalıştırmaz ve standart 409 üretir", async () => {
    const { tx } = fakeTransaction({ lockRows: [], currentRevision: 4 });
    withTransactionMock.mockImplementation((fn) => fn(tx));
    const mutate = vi.fn();

    let caught: unknown;
    try {
      await runPanelMutation({
        hotelId: "hotel-1",
        scope: "rooms",
        expectedRevision: 3,
        updatedBy: "user-1",
        mutate,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(PanelRevisionConflict);
    expect(mutate).not.toHaveBeenCalled();
    const response = panelRevisionConflictResponse(caught);
    expect(response?.status).toBe(409);
    await expect(response?.json()).resolves.toMatchObject({
      ok: false,
      code: "REVISION_CONFLICT",
      currentRevision: 4,
      updatedBy: "user-2",
    });
  });

  it("iş mutasyonu iptal edilirse otel taslak sürümünü artırmaz", async () => {
    const { tx, hotelUpdates } = fakeTransaction({
      lockRows: [{ revision: 2, updatedAt: new Date(), updatedBy: "user-1" }],
    });
    withTransactionMock.mockImplementation((fn) => fn(tx));

    let caught: unknown;
    try {
      await runPanelMutation({
        hotelId: "hotel-1",
        scope: "rooms",
        expectedRevision: 1,
        updatedBy: "user-1",
        mutate: async () => abortPanelMutation("Kayıt bulunamadı."),
      });
    } catch (error) {
      caught = error;
    }

    expect(hotelUpdates).toHaveLength(0);
    const response = panelRevisionConflictResponse(caught);
    expect(response?.status).toBe(404);
  });
});

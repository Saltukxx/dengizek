import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notifyHotelMembers: vi.fn(),
  sendEmail: vi.fn(),
  rotateInquiryPortalToken: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({ notifyHotelMembers: mocks.notifyHotelMembers }));
vi.mock("@/lib/email", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/inquiry-portal-token", () => ({ rotateInquiryPortalToken: mocks.rotateInquiryPortalToken }));

import { approveInquiry, approveMessage, rejectMessage } from "./inquiry-moderation";

/**
 * Drizzle zinciri mock'u:
 *   update(..).set(..).where(..).returning() → returnQueue.shift()
 *   select(..).from(..).where(..).limit(..)  → selectQueue.shift()
 */
function makeDb(selectQueue: unknown[], returnQueue: unknown[]) {
  const sets: unknown[] = [];
  const db = {
    update: () => ({
      set: (v: unknown) => {
        sets.push(v);
        return { where: () => ({ returning: () => Promise.resolve(returnQueue.shift() ?? []) }) };
      },
    }),
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(selectQueue.shift() ?? []) }) }),
    }),
  };
  return { db, sets };
}

beforeEach(() => {
  mocks.notifyHotelMembers.mockReset();
  mocks.sendEmail.mockReset();
  mocks.rotateInquiryPortalToken.mockReset().mockResolvedValue("fresh-token");
});

describe("inquiry moderation", () => {
  it("ilk talep onaylanınca tesise bildirim gider", async () => {
    const updated = { id: "i1", hotelId: "h1", name: "Ada", message: "Merhaba" };
    const { db, sets } = makeDb([], [[updated]]);

    const res = await approveInquiry(db as never, "i1", "admin-1");

    expect(res).toMatchObject({ id: "i1" });
    expect(sets[0]).toMatchObject({ approvalStatus: "onaylandi", approvedBy: "admin-1" });
    expect(mocks.notifyHotelMembers).toHaveBeenCalledWith(
      "h1",
      expect.objectContaining({ type: "talep", link: "/dashboard/inquiries" }),
    );
  });

  it("otel yanıtı onaylanınca misafire e-posta + yeni portal linki gider", async () => {
    const message = { id: "m1", inquiryId: "i1", senderRole: "hotel", body: "Buyurun" };
    const inquiry = { id: "i1", hotelId: "h1", email: "ada@example.com", name: "Ada", approvalStatus: "onaylandi" };
    // select: önce mesaj, sonra talep. update: mesaj güncellemesi.
    const { db } = makeDb([[message], [inquiry]], [[{ ...message, approvalStatus: "onaylandi" }]]);

    await approveMessage(db as never, "m1", "admin-1");

    expect(mocks.rotateInquiryPortalToken).toHaveBeenCalled();
    expect(mocks.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ada@example.com", text: expect.stringContaining("/fresh-token") }),
    );
    expect(mocks.notifyHotelMembers).not.toHaveBeenCalled();
  });

  it("misafir mesajı onaylanınca tesise bildirim gider (e-posta değil)", async () => {
    const message = { id: "m2", inquiryId: "i1", senderRole: "guest", body: "Soru" };
    const inquiry = { id: "i1", hotelId: "h1", email: "ada@example.com", name: "Ada", approvalStatus: "onaylandi" };
    const { db } = makeDb([[message], [inquiry]], [[{ ...message, approvalStatus: "onaylandi" }]]);

    await approveMessage(db as never, "m2", "admin-1");

    expect(mocks.notifyHotelMembers).toHaveBeenCalledWith(
      "h1",
      expect.objectContaining({ type: "mesaj" }),
    );
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("talebi henüz onaylanmamışsa misafir mesajı onayı tesise bildirim DÜŞÜRMEZ", async () => {
    const message = { id: "m3", inquiryId: "i1", senderRole: "guest", body: "Soru" };
    const inquiry = { id: "i1", hotelId: "h1", email: "ada@example.com", name: "Ada", approvalStatus: "bekliyor" };
    const { db } = makeDb([[message], [inquiry]], [[{ ...message, approvalStatus: "onaylandi" }]]);

    await approveMessage(db as never, "m3", "admin-1");

    expect(mocks.notifyHotelMembers).not.toHaveBeenCalled();
  });

  it("mesaj reddedilince karşı tarafa hiç teslim edilmez", async () => {
    const { db, sets } = makeDb([], [[{ id: "m4", approvalStatus: "reddedildi" }]]);

    await rejectMessage(db as never, "m4", "admin-1", "spam");

    expect(sets[0]).toMatchObject({ approvalStatus: "reddedildi", rejectedReason: "spam" });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.notifyHotelMembers).not.toHaveBeenCalled();
  });
});

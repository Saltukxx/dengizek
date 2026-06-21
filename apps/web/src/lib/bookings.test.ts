import { describe, expect, it } from "vitest";
import { BookingServiceError } from "@/lib/bookings";

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

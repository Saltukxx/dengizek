// ---------------------------------------------------------------------------
// Onay kapısı testleri — varsayılan REDDET.
// ---------------------------------------------------------------------------

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONSENT_STORAGE_KEY, hasAnalyticsConsent, readConsent, writeConsent } from "@/lib/consent";

beforeEach(() => {
  window.localStorage.clear();
});

describe("readConsent", () => {
  it("hiç seçim yoksa null", () => {
    expect(readConsent()).toBeNull();
  });

  it("kaydedilmiş tercihi okur", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "granted");
    expect(readConsent()).toBe("granted");
  });

  it("bozuk değeri yok sayar", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, "belki");
    expect(readConsent()).toBeNull();
  });
});

describe("hasAnalyticsConsent — varsayılan reddet", () => {
  it("seçim yapılmamışsa false", () => {
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("reddedilmişse false", () => {
    writeConsent("denied");
    expect(hasAnalyticsConsent()).toBe(false);
  });

  it("yalnızca açık onayda true", () => {
    writeConsent("granted");
    expect(hasAnalyticsConsent()).toBe(true);
  });

  it("localStorage erişilemezse false (güvenli taraf)", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("kapalı");
    });
    expect(hasAnalyticsConsent()).toBe(false);
    spy.mockRestore();
  });
});

describe("trackEvent onay kapısı", () => {
  it("onaysızken istek göndermez", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const { trackEvent } = await import("@/lib/analytics-client");
    await trackEvent("tour_step_view", {}, "aurelia-bay");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("onaylıyken istek gönderir", async () => {
    writeConsent("granted");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}"));
    const { trackEvent } = await import("@/lib/analytics-client");
    await trackEvent("tour_step_view", {}, "aurelia-bay");
    expect(fetchSpy).toHaveBeenCalledWith("/api/analytics/track", expect.anything());
    fetchSpy.mockRestore();
  });
});

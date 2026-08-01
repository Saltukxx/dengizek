// ---------------------------------------------------------------------------
// Sentry gizlilik testleri — hata takibi için kişisel veri/sır göndermiyoruz.
// ---------------------------------------------------------------------------

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { isSentryEnabled, scrubEvent, scrubUrl } from "@/lib/sentry";

const originalEnv = { ...process.env };

beforeEach(() => {
  delete process.env.SENTRY_DSN;
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("isSentryEnabled", () => {
  it("DSN yoksa kapalı", () => {
    expect(isSentryEnabled()).toBe(false);
  });

  it("DSN varsa açık", () => {
    process.env.SENTRY_DSN = "https://x@o1.ingest.sentry.io/1";
    expect(isSentryEnabled()).toBe(true);
  });
});

describe("scrubUrl — yol içindeki sırlar", () => {
  it("talep portalı token'ını maskeler", () => {
    expect(scrubUrl("https://app/inquiry/portal/0WPKLMBgdL2Ejjw")).toBe(
      "https://app/inquiry/portal/[token]",
    );
  });

  it("şifre sıfırlama token'ını maskeler", () => {
    expect(scrubUrl("https://app/sifremi-sifirla/abc123")).toBe(
      "https://app/sifremi-sifirla/[token]",
    );
  });

  it("iCal dışa aktarma token'ını maskeler", () => {
    expect(scrubUrl("https://app/api/ical/export/deadbeef")).toBe(
      "https://app/api/ical/export/[token]",
    );
  });

  it("portal API yolunu maskeler", () => {
    expect(scrubUrl("https://app/api/inquiry/portal/secret/messages")).toContain(
      "/api/inquiry/portal/[token]",
    );
  });
});

describe("scrubUrl — query değerleri", () => {
  it("token parametresini gizler", () => {
    expect(scrubUrl("https://app/x?token=gizli&sayfa=2")).toBe(
      "https://app/x?token=[gizlendi]&sayfa=2",
    );
  });

  it("e-posta parametresini gizler", () => {
    expect(scrubUrl("https://app/x?email=ada@example.com")).toBe("https://app/x?email=[gizlendi]");
  });

  it("zararsız parametrelere dokunmaz", () => {
    expect(scrubUrl("https://app/browse?q=deniz&fiyat=orta")).toBe(
      "https://app/browse?q=deniz&fiyat=orta",
    );
  });

  it("query yoksa URL'i bozmaz", () => {
    expect(scrubUrl("https://app/browse")).toBe("https://app/browse");
  });
});

describe("scrubEvent", () => {
  it("request URL'ini maskeler", () => {
    const event = { request: { url: "https://app/inquiry/portal/gizli?token=abc" } } as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.url).toBe("https://app/inquiry/portal/[token]?token=[gizlendi]");
  });

  it("çerez ve başlıkları tamamen siler", () => {
    const event = {
      request: {
        url: "https://app/x",
        cookies: { session: "gizli" },
        headers: { authorization: "Bearer gizli" },
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toBeUndefined();
  });

  it("query_string'i maskeler", () => {
    const event = { request: { query_string: "token=abc&sayfa=1" } } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.query_string).toBe("token=[gizlendi]&sayfa=1");
  });

  it("request yoksa olayı bozmaz", () => {
    const event = { message: "hata" } as ErrorEvent;
    expect(scrubEvent(event)).toEqual({ message: "hata" });
  });
});

import { describe, expect, it } from "vitest";
import {
  attributionFromSearch,
  attributionLabel,
  configIds,
  conversionTargets,
  hotelSlugFromPath,
  tagsForConversion,
  tagsForPage,
  type PublicAdTag,
} from "@/lib/ad-tags";
import { adTagCreateSchema, adTagUpdateSchema } from "@/lib/schemas/ad-tags";

const tag = (over: Partial<PublicAdTag>): PublicAdTag => ({
  pagePath: null,
  hotelSlug: null,
  googleAdsId: null,
  conversionLabel: null,
  ga4Id: null,
  ...over,
});

const kis = tag({ pagePath: "/kis", googleAdsId: "AW-111111", conversionLabel: "kisLabel" });
const otelBul = tag({ pagePath: "/otel-bul", googleAdsId: "AW-222222", conversionLabel: "botLabel" });
const otelA = tag({ hotelSlug: "otel-a", googleAdsId: "AW-333333", conversionLabel: "aLabel", ga4Id: "G-AAAA11" });
const otelB = tag({ hotelSlug: "otel-b", googleAdsId: "AW-111111", conversionLabel: "bLabel" });
const all = [kis, otelBul, otelA, otelB];

describe("hotelSlugFromPath", () => {
  it("otel, kış otel, oda ve tur sayfalarından slug çıkarır", () => {
    expect(hotelSlugFromPath("/hotels/otel-a")).toBe("otel-a");
    expect(hotelSlugFromPath("/hotels/otel-a/rooms/deluxe")).toBe("otel-a");
    expect(hotelSlugFromPath("/kis/oteller/otel-b")).toBe("otel-b");
    expect(hotelSlugFromPath("/tours/otel-a/t1")).toBe("otel-a");
  });

  it("genel sayfada null", () => {
    expect(hotelSlugFromPath("/kis/oteller")).toBeNull();
    expect(hotelSlugFromPath("/")).toBeNull();
  });
});

describe("tagsForPage", () => {
  it("sayfanın kendi kodu + sayfanın otelinin kodu", () => {
    expect(tagsForPage(all, "/kis", null)).toEqual([kis]);
    expect(tagsForPage(all, "/hotels/otel-a", "otel-a")).toEqual([otelA]);
  });
});

describe("tagsForConversion", () => {
  it("genel sayfadan gelen misafir: giriş sayfası + otel birlikte", () => {
    const matched = tagsForConversion(all, "/kis", "otel-a");
    expect(matched).toEqual([kis, otelA]);
    expect(conversionTargets(matched)).toEqual(["AW-111111/kisLabel", "AW-333333/aLabel"]);
  });

  it("otel sayfasından giren: yalnız o otel (talep başka otele değilse)", () => {
    expect(tagsForConversion(all, "/hotels/otel-a", "otel-a")).toEqual([otelA]);
  });

  it("giriş bilinmiyorsa yalnız otel", () => {
    expect(tagsForConversion(all, null, "otel-b")).toEqual([otelB]);
  });

  it("aynı Ads hesabı tek kez yapılandırılır", () => {
    expect(configIds([kis, otelB])).toEqual(["AW-111111"]);
    expect(configIds([otelA])).toEqual(["AW-333333", "G-AAAA11"]);
  });
});

describe("attributionFromSearch", () => {
  it("gclid ve utm parametrelerini okur", () => {
    expect(attributionFromSearch("?gclid=abc&utm_source=google&utm_medium=cpc&utm_campaign=yaz&x=1")).toEqual({
      gclid: "abc",
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "yaz",
    });
  });

  it("reklam parametresi yoksa null", () => {
    expect(attributionFromSearch("?hotel=otel-a")).toBeNull();
  });

  it("panel etiketi", () => {
    expect(attributionLabel({ utmSource: "google", utmMedium: "cpc", utmCampaign: "yaz" })).toBe("google / cpc · yaz");
    expect(attributionLabel({ gclid: "abc", landingPath: "/kis" })).toBe("Google Ads");
    expect(attributionLabel({ landingPath: "/kis" })).toBe("Giriş: /kis");
    expect(attributionLabel(null)).toBeNull();
  });
});

describe("adTagCreateSchema", () => {
  const hotelId = "6f1c1c2e-2f0a-4c55-9a77-5d7f3f0b8a10";

  it("geçerli sayfa ve otel kayıtları", () => {
    expect(adTagCreateSchema.safeParse({ pagePath: "/kis", googleAdsId: "AW-123456789", conversionLabel: "AbC-d_1" }).success).toBe(true);
    expect(adTagCreateSchema.safeParse({ hotelId, ga4Id: "G-ABC123" }).success).toBe(true);
  });

  it("hedef tam olarak bir tane olmalı", () => {
    expect(adTagCreateSchema.safeParse({ googleAdsId: "AW-123456789" }).success).toBe(false);
    expect(adTagCreateSchema.safeParse({ pagePath: "/kis", hotelId, googleAdsId: "AW-123456789" }).success).toBe(false);
  });

  it("serbest script ve hatalı biçim reddedilir", () => {
    expect(adTagCreateSchema.safeParse({ pagePath: "/kis", googleAdsId: "<script>alert(1)</script>" }).success).toBe(false);
    expect(adTagCreateSchema.safeParse({ pagePath: "/kis", googleAdsId: "AW-123456789", conversionLabel: "a\"b" }).success).toBe(false);
    expect(adTagCreateSchema.safeParse({ pagePath: "/admin", googleAdsId: "AW-123456789" }).success).toBe(false);
  });

  it("en az bir kimlik; etiket Ads kimliği ister", () => {
    expect(adTagCreateSchema.safeParse({ pagePath: "/kis", googleAdsId: "", ga4Id: "" }).success).toBe(false);
    expect(adTagCreateSchema.safeParse({ pagePath: "/kis", ga4Id: "G-ABC123", conversionLabel: "lbl1" }).success).toBe(false);
  });
});

describe("adTagUpdateSchema", () => {
  it("yalnız aç/kapat kimlik istemez", () => {
    expect(adTagUpdateSchema.safeParse({ enabled: false }).success).toBe(true);
  });
});

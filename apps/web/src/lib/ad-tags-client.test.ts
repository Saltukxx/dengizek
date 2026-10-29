import { beforeEach, describe, expect, it } from "vitest";
import {
  attributionForSubmit,
  captureAttribution,
  rememberInquiryConversion,
  sendConversions,
  takePendingConversion,
} from "@/lib/ad-tags-client";
import { writeConsent } from "@/lib/consent";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  delete window.gtag;
  delete window.dataLayer;
  document.head.innerHTML = "";
});

describe("captureAttribution", () => {
  it("oturumun ilk sayfası giriş sayfasıdır; sonraki sayfalar değiştirmez", () => {
    captureAttribution("/kis", "");
    expect(captureAttribution("/hotels/otel-a", "").landingPath).toBe("/kis");
  });

  it("yeni reklam tıklaması giriş sayfasını günceller", () => {
    captureAttribution("/", "");
    const attr = captureAttribution("/otel-bul", "?gclid=xyz&utm_campaign=kis");
    expect(attr).toEqual({ gclid: "xyz", utmCampaign: "kis", landingPath: "/otel-bul" });
  });
});

describe("onay kuralı", () => {
  it("onay yoksa kaynak sunucuya gönderilmez, gtag yüklenmez", () => {
    captureAttribution("/kis", "?gclid=xyz");
    expect(attributionForSubmit()).toBeUndefined();
    sendConversions(["AW-111111"], ["AW-111111/lbl"], [], "inq-1");
    expect(window.gtag).toBeUndefined();
    expect(document.querySelector("script[src*=googletagmanager]")).toBeNull();
  });

  it("onayla kaynak gider ve dönüşüm talep numarasıyla gönderilir", () => {
    writeConsent("granted");
    captureAttribution("/kis", "?gclid=xyz");
    expect(attributionForSubmit()).toMatchObject({ gclid: "xyz", landingPath: "/kis" });

    sendConversions(["AW-111111", "G-AAAA11"], ["AW-111111/lbl"], ["G-AAAA11"], "inq-1");
    const calls = (window.dataLayer ?? []).map((args) => Array.from(args as ArrayLike<unknown>));
    expect(calls).toContainEqual(["event", "conversion", { send_to: "AW-111111/lbl", transaction_id: "inq-1" }]);
    expect(calls).toContainEqual(["event", "generate_lead", { send_to: "G-AAAA11", transaction_id: "inq-1" }]);
    expect(document.querySelector("script[src*='googletagmanager.com/gtag/js?id=AW-111111']")).not.toBeNull();
  });
});

describe("bekleyen dönüşüm", () => {
  it("bir kez alınır (sayfa yenilenince ikinci kez sayılmaz)", () => {
    rememberInquiryConversion("inq-9", "otel-a");
    expect(takePendingConversion()).toEqual({ inquiryId: "inq-9", hotelSlug: "otel-a" });
    expect(takePendingConversion()).toBeNull();
  });
});

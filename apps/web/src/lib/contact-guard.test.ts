import { describe, expect, it } from "vitest";
import { CONTACT_MASK, containsContactInfo, redactContactInfo } from "./contact-guard";

describe("redactContactInfo", () => {
  it.each([
    ["Beni 0532 123 45 67 numarasından arayın", "0532"],
    ["Tel: +90 (532) 123-45-67", "532"],
    ["numaram 05321234567", "0532"],
    ["00905321234567 yazın", "0090"],
    ["ada@example.com adresine yazın", "example"],
    ["ada (at) example (dot) com", "example"],
    ["https://otelim.com/rezervasyon üzerinden", "otelim"],
    ["www.otelim.com.tr sitemiz", "otelim"],
    ["otelim.com sitesinden ucuz", "otelim"],
    ["wa.me/905321234567", "wa.me"],
    ["instagramdan @karzirvesi yazın", "karzirvesi"],
    ["sıfır beş üç iki bir iki üç dört beş altı yedi", "üç iki"],
  ])("%s → maskelenir", (input, leaked) => {
    const out = redactContactInfo(input);
    expect(out).toContain(CONTACT_MASK);
    expect(out).not.toContain(leaked);
    expect(containsContactInfo(input)).toBe(true);
  });

  it.each([
    "10.10.2026 - 15.10.2026 arası 2 yetişkin 1 çocuk",
    "2026-12-10 ile 2026-12-13 arasında müsait misiniz?",
    "Gecelik 12.500 TL, toplam 1.250.000 kuruş",
    "38 m2 oda, 2 yetişkin + 1 çocuk, 3 gece",
    "Giriş 14:00, çıkış 11:00. Oda 204 olabilir mi?",
    "Kahvaltı dahil mi? Bir iki sorum var.",
    "Havalimanına 35 km, pist 200 metre.",
    "Transfer için saat 18.30'da geliyoruz.",
  ])("%s → dokunulmaz", (input) => {
    expect(redactContactInfo(input)).toBe(input);
    expect(containsContactInfo(input)).toBe(false);
  });

  it("yalnız iletişim parçasını maskeler, cümlenin kalanını korur", () => {
    expect(redactContactInfo("Merhaba, 0532 123 45 67 arayın, 10.10.2026 için.")).toBe(
      `Merhaba, ${CONTACT_MASK} arayın, 10.10.2026 için.`,
    );
  });

  it("e-postadan sonraki cümlede geçen tarihi adresin parçası saymaz", () => {
    expect(redactContactInfo("Yazın: ada.ozel@example.org. 10.12.2026 girişi için.")).toBe(
      `Yazın: ${CONTACT_MASK}. 10.12.2026 girişi için.`,
    );
  });

  it("art arda gelen maskeleri tekiller", () => {
    const out = redactContactInfo("ada@example.com / 0532 123 45 67");
    expect(out.match(/gizlendi/g)).toHaveLength(1);
  });

  it("boş ve null değerde güvenli", () => {
    expect(redactContactInfo("")).toBe("");
    expect(containsContactInfo(null)).toBe(false);
  });
});

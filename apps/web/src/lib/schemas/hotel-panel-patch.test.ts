import { describe, expect, it } from "vitest";
import {
  availabilityNotePatchSchema,
  promotionPatchSchema,
  ratePlanPatchSchema,
  ratePlanPricePatchSchema,
} from "./hotel-panel";

const id = "00000000-0000-4000-8000-000000000000";

describe("PATCH şemaları gönderilmeyen alanı varsayılanla doldurmaz", () => {
  it.each([
    ["kampanya", promotionPatchSchema, { id, isActive: false }],
    ["fiyat planı", ratePlanPatchSchema, { id, isDefault: true }],
    ["plan fiyatı", ratePlanPricePatchSchema, { id, priceMinor: 100 }],
    ["müsaitlik notu", availabilityNotePatchSchema, { id, label: "Bakım" }],
  ] as const)("%s: çıktı yalnız gönderilen alanları içerir", (_name, schema, body) => {
    expect(schema.parse(body)).toEqual(body);
  });

  it("kampanyayı durdurmak oda kısıtını silmez", () => {
    expect(promotionPatchSchema.parse({ id, isActive: false })).not.toHaveProperty("roomIds");
  });

  it("alan kuralları korunur", () => {
    expect(promotionPatchSchema.safeParse({ id, discountPercent: 95 }).success).toBe(false);
    expect(ratePlanPricePatchSchema.safeParse({ id, currency: "TL" }).success).toBe(false);
  });
});

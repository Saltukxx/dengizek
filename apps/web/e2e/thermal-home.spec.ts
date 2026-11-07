import { expect, test } from "@playwright/test";

test.describe("Termal vitrini", () => {
  test("yapay zekâ bölümünde sol sahne kaydırırken ekranda kalır", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/termal");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Termal oteli gitmeden gezin");
    // Banner'ın üstündeki etiket kaldırıldı.
    await expect(page.getByText("Yapay zekâ destekli video tur", { exact: false })).toHaveCount(0);

    const stage = page.locator(".tai-stage");
    const tops: number[] = [];
    for (const step of ["arama", "dogruluk", "ses"]) {
      await page.locator(`[data-step="${step}"]`).evaluate((el) => el.scrollIntoView({ block: "center" }));
      await expect(page.locator(`[data-step="${step}"]`)).toHaveAttribute("data-active");
      const box = await stage.boundingBox();
      tops.push(Math.round(box!.y));
    }
    // İlk adımdan sonra sahne üst menünün altında sabit durur (sticky).
    expect(tops[1]).toBe(tops[2]);
    expect(tops[1]).toBeGreaterThan(0);
    expect(tops[1]).toBeLessThan(200);
    // Üst menü de kaydırırken yerinde kalır.
    const header = await page.locator(".er-header").boundingBox();
    expect(Math.round(header!.y)).toBe(0);
  });
});

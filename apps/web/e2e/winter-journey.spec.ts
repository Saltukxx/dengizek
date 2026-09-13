import { config } from "dotenv";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

config({ path: ".env.local" });

test.describe("Kış misafir yolculuğu", () => {
  test("ana sayfa → liste → detay → tur → talep bağlamını korur", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const email = `kis-e2e-${stamp}@example.com`;
    const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;
    try {
      await page.goto("/kis");
      await expect(page.getByRole("heading", { name: /Kışı, gitmeden önce yaşayın/i })).toBeVisible();
      await page.getByRole("link", { name: "Tümünü gör" }).click();
      await expect(page).toHaveURL(/\/kis\/oteller/);
      await expect(page.getByRole("heading", { name: "Kış tatili otelleri" })).toBeVisible();

      await page.getByRole("link", { name: /Aurelia Bay/i }).first().click();
      await expect(page).toHaveURL(/\/kis\/oteller\/aurelia-bay/);
      await expect(page.getByRole("heading", { name: /Aurelia Bay/i }).first()).toBeVisible();
      await page.getByRole("link", { name: "Sanal Turu Başlat" }).click();
      await expect(page).toHaveURL(/\/tours\/aurelia-bay\/demo-lobby\?surface=kis/);
      await expect(page.locator(".er-tour-winter")).toBeVisible();

      await page.getByRole("link", { name: "Talep Gönder" }).first().click();
      await expect(page).toHaveURL(/\/kis\/talep\?hotel=aurelia-bay/);
      await page.getByPlaceholder("Adınız ve soyadınız").fill("Kış E2E Misafiri");
      await page.getByPlaceholder("ornek@email.com").fill(email);
      await page.getByPlaceholder("Özel talepler…").fill("Kış tatili için bilgi rica ediyorum.");
      await page.getByTestId("inquiry-submit").click();
      await expect(page).toHaveURL(/\/kis\/talep\/basarili\?emailStatus=(queued|sent|unavailable)/, {
        timeout: 20_000,
      });
      await expect(page.getByRole("link", { name: "Kış Otellerine Dön" })).toBeVisible();
    } finally {
      if (sql) {
        await sql`
          delete from analytics_events
          where payload->>'inquiryId' in (
            select id::text from inquiries where email = ${email}
          )
        `;
        await sql`delete from email_outbox where to_address = ${email}`;
        await sql`delete from user_notifications where body like ${`Kış E2E Misafiri — %`}`;
        await sql`delete from inquiries where email = ${email}`;
        await sql.end();
      }
    }
  });

  test("sezonsuz yayımlanmış eski tesisi yazda tutar, kıştan ayırır", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const name = `E2E Legacy Yaz ${stamp}`;
    let hotelId: string | undefined;
    const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;
    await login(page, "admin");
    try {
      const created = await page.request.post("/api/admin/hotels", {
        data: { name, city: "İzmir", country: "Türkiye" },
      });
      expect(created.ok()).toBe(true);
      hotelId = (await created.json()).hotel.id as string;

      const submitted = await page.request.post(`/api/manager/hotels/${hotelId}/submit`);
      expect(submitted.ok()).toBe(true);
      const submittedRevision = (await submitted.json()).submittedRevision as number;
      const moderated = await page.request.post(`/api/admin/hotels/${hotelId}/moderation`, {
        data: { karar: "onayla", submittedRevision },
      });
      expect(moderated.ok()).toBe(true);

      const summer = await page.request.get("/browse");
      expect(await summer.text()).toContain(name);
      const winter = await page.request.get("/kis/oteller");
      expect(await winter.text()).not.toContain(name);
    } finally {
      if (sql && hotelId) await sql`delete from hotels where id = ${hotelId}`;
      if (sql) await sql.end();
    }
  });
});

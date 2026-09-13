import { config } from "dotenv";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

config({ path: ".env.local" });

test.describe("Panel yaşam döngüleri", () => {
  test("rezervasyonu oluşturur, onaylar, yenilemede kalıcılığı ve ödeme Yakında durumunu gösterir", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const email = `booking-${stamp}@example.com`;
    const guestName = `E2E Rezervasyon ${stamp}`;
    const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;
    await login(page, "manager");
    try {
      await page.goto("/dashboard/bookings");
      await page.getByRole("button", { name: "Rezervasyon ekle" }).click();
      const dialog = page.getByRole("dialog", { name: "Yeni rezervasyon" });
      await dialog.getByLabel("Misafir adı").fill(guestName);
      await dialog.getByLabel("E-posta").fill(email);
      await dialog.getByLabel("Giriş").fill("2027-01-10");
      await dialog.getByLabel("Çıkış").fill("2027-01-13");
      await dialog.getByLabel("Toplam tutar").fill("12500");
      await dialog.getByRole("button", { name: "Oluştur" }).click();

      let row = page.locator("tbody tr").filter({ hasText: email });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByRole("button", { name: "Onayla" }).click();
      await expect(page.getByText(/Rezervasyon onaylandı olarak güncellendi/i)).toBeVisible();
      await expect(row.getByText("Onaylandı")).toBeVisible();
      await expect(row.getByRole("button", { name: "Tahsilat yakında" })).toBeDisabled();

      await page.reload();
      row = page.locator("tbody tr").filter({ hasText: email });
      await expect(row.getByText("Onaylandı")).toBeVisible({ timeout: 20_000 });
    } finally {
      if (sql) {
        const rows = await sql<{ id: string }[]>`select id from bookings where guest_email = ${email}`;
        for (const row of rows) await sql`delete from audit_log where entity_id = ${row.id}`;
        await sql`delete from bookings where guest_email = ${email}`;
        await sql.end();
      }
    }
  });

  test("envanter değişikliğini kaydeder, API'den yeniden okuyup gösterir ve geri temizler", async ({ page }) => {
    await login(page, "manager");
    await page.goto("/dashboard/availability");
    await page.getByRole("tab", { name: "Envanter" }).click();
    const allotment = page.getByRole("textbox", { name: /kontenjan$/ }).first();
    await expect(allotment).toBeVisible({ timeout: 20_000 });
    const original = await allotment.inputValue();
    const next = original === "7" ? "8" : "7";
    try {
      await allotment.fill(next);
      await page.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect(page.getByText("Envanter kaydedildi.")).toBeVisible({ timeout: 20_000 });

      await page.reload();
      await page.getByRole("tab", { name: "Envanter" }).click();
      await expect(page.getByRole("textbox", { name: /kontenjan$/ }).first()).toHaveValue(next, {
        timeout: 20_000,
      });
    } finally {
      await page.getByRole("textbox", { name: /kontenjan$/ }).first().fill(original);
      await page.getByRole("button", { name: "Kaydet", exact: true }).click();
      await expect(page.getByText("Envanter kaydedildi.")).toBeVisible({ timeout: 20_000 });
    }
  });

  test("admin kullanıcı üyeliğini ve yorum moderasyonunu kalıcı DB sonucuyla yönetir", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const email = `manager-${stamp}@example.com`;
    const userName = `E2E Yönetici ${stamp}`;
    const reviewer = `E2E Misafir ${stamp}`;
    const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;
    if (!sql) throw new Error("DATABASE_URL panel yaşam döngüsü testi için gerekli.");
    const [review] = await sql<{ id: string }[]>`
      insert into reviews (hotel_id, rating, title, body, guest_name, status)
      select id, 5, 'E2E kış yorumu', 'Servis ve oda deneyimi çok iyiydi.', ${reviewer}, 'beklemede'
      from hotels where slug = 'aurelia-bay'
      returning id
    `;
    let userId: string | undefined;
    try {
      await login(page, "admin");
      await page.goto("/admin/users");
      await page.getByRole("button", { name: "Yeni kullanıcı" }).click();
      const createDialog = page.getByRole("dialog", { name: "Yeni kullanıcı" });
      await createDialog.getByLabel("Ad soyad").fill(userName);
      await createDialog.getByLabel("E-posta").fill(email);
      await createDialog.getByLabel("Geçici şifre").fill("Guvenli123!");
      await createDialog.getByRole("button", { name: "Oluştur" }).click();
      await expect(page.getByText("Kullanıcı oluşturuldu.")).toBeVisible({ timeout: 20_000 });

      let userRow = page.locator("tbody tr").filter({ hasText: email });
      await expect(userRow).toBeVisible();
      await userRow.getByRole("button", { name: "Otele ata" }).click();
      const assignDialog = page.getByRole("dialog", { name: new RegExp(`Otele ata — ${userName}`) });
      await assignDialog.getByLabel("Tesis").click();
      await page.getByRole("option", { name: "Aurelia Bay Otel" }).click();
      await assignDialog.getByRole("button", { name: "Ata" }).click();
      await expect(page.getByText("Üyelik atandı.")).toBeVisible({ timeout: 20_000 });
      await page.reload();
      userRow = page.locator("tbody tr").filter({ hasText: email });
      await expect(userRow.getByText(/Aurelia Bay Otel/)).toBeVisible({ timeout: 20_000 });

      const [user] = await sql<{ id: string }[]>`select id from users where email = ${email}`;
      userId = user?.id;
      const memberships = await sql`select role from hotel_members where user_id = ${userId ?? ""}`;
      expect(memberships).toHaveLength(1);

      await page.goto("/admin/reviews");
      const reviewRow = page.locator("tbody tr").filter({ hasText: reviewer });
      await expect(reviewRow).toBeVisible({ timeout: 20_000 });
      await reviewRow.getByRole("button", { name: "Onayla" }).click();
      await expect(page.getByText("Yorum yayına alındı.")).toBeVisible();
      const [persisted] = await sql<{ status: string }[]>`select status from reviews where id = ${review.id}`;
      expect(persisted.status).toBe("yayinda");
    } finally {
      await sql`delete from audit_log where entity_id in (${review.id}, ${userId ?? "00000000-0000-0000-0000-000000000000"})`;
      await sql`delete from reviews where id = ${review.id}`;
      await sql`delete from users where email = ${email}`;
      await sql.end();
    }
  });
});

import { config } from "dotenv";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { login } from "./helpers";

config({ path: ".env.local" });

test.describe("Panel yaşam döngüleri", () => {
  test("talepten rezervasyon açar, onaylar; panelde misafir iletişim bilgisi görünmez", async ({ page }) => {
    const stamp = Date.now().toString(36);
    const email = `booking-${stamp}@example.com`;
    const guestName = `E2E Rezervasyon ${stamp}`;
    const sql = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1 }) : null;
    await login(page, "manager");
    try {
      // Rezervasyonun tek kaynağı Otelsayfam talebidir.
      const created = await page.request.post("/api/inquiry", {
        data: {
          name: guestName,
          email,
          message: "Kış tatili için yer var mı? Beni 0532 123 45 67 numarasından arayın.",
          hotelSlug: "aurelia-bay",
          checkIn: "2027-01-10",
          checkOut: "2027-01-13",
          adults: 2,
          children: 0,
          marketingConsent: false,
        },
      });
      expect(created.ok()).toBe(true);

      await page.goto("/dashboard/inquiries");
      const inquiryRow = page.locator("tbody tr").filter({ hasText: guestName });
      await expect(inquiryRow).toBeVisible({ timeout: 20_000 });
      // Tesis misafirin e-postasını da mesaja yazdığı telefonu da göremez.
      await expect(inquiryRow).not.toContainText(email);
      await expect(inquiryRow).not.toContainText("0532");
      await expect(inquiryRow).toContainText("iletişim bilgisi gizlendi");
      await inquiryRow.getByRole("button", { name: "Rezervasyona dönüştür" }).click();
      await expect(page.getByText("Rezervasyon oluşturuldu.")).toBeVisible();

      await page.goto("/dashboard/bookings");
      // Dışarıdan misafir girişi yok.
      await expect(page.getByRole("button", { name: "Rezervasyon ekle" })).toHaveCount(0);
      let row = page.locator("tbody tr").filter({ hasText: guestName });
      await expect(row).toBeVisible({ timeout: 20_000 });
      await expect(row).not.toContainText(email);
      await row.getByRole("button", { name: "Onayla" }).click();
      await expect(page.getByText("Rezervasyon onaylandı.")).toBeVisible();
      await expect(row.getByText("Onaylandı")).toBeVisible();

      await page.reload();
      row = page.locator("tbody tr").filter({ hasText: guestName });
      await expect(row.getByText("Onaylandı")).toBeVisible({ timeout: 20_000 });
    } finally {
      if (sql) {
        const rows = await sql<{ id: string }[]>`select id from bookings where guest_email = ${email}`;
        for (const row of rows) await sql`delete from audit_log where entity_id = ${row.id}`;
        await sql`delete from bookings where guest_email = ${email}`;
        await sql`delete from analytics_events where payload->>'inquiryId' in (select id::text from inquiries where email = ${email})`;
        await sql`delete from email_outbox where to_address = ${email}`;
        await sql`delete from user_notifications where body like ${`${guestName} — %`}`;
        await sql`delete from inquiries where email = ${email}`;
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

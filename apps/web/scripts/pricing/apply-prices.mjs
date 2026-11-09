// Fiyat dönemlerini panel API'si üzerinden yazar, oteli incelemeye gönderip
// yönetici onayıyla yayına alır (misafir sayfası onayla güncellenir).
// Kullanım: node scripts/pricing/apply-prices.mjs <base-url> <spec.json> <admin-email> [--dry-run]
// Şifre ADMIN_PASSWORD ortam değişkeninden okunur (komut satırına yazılmaz).
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const [base, specPath, email] = process.argv.slice(2);
const dryRun = process.argv.includes("--dry-run");
const password = process.env.ADMIN_PASSWORD;
if (!base || !specPath || !email || !password) {
  console.error("Kullanım: ADMIN_PASSWORD=… node apply-prices.mjs <base-url> <spec.json> <admin-email> [--dry-run]");
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
await page.goto(`${base}/giris`);
await page.getByLabel("E-posta").fill(email);
await page.getByLabel("Şifre", { exact: true }).fill(password);
await page.getByRole("button", { name: "Giriş yap" }).click();
await page.waitForURL(/\/(admin|dashboard)/, { timeout: 30_000 });
const api = ctx.request;

async function call(method, path, data) {
  const res = await api.fetch(`${base}${path}`, { method, data, headers: data ? { "Content-Type": "application/json" } : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok() || json.ok === false) throw new Error(`${method} ${path} → ${res.status()} ${JSON.stringify(json).slice(0, 300)}`);
  return json;
}

const hotels = (await call("GET", "/api/admin/hotels?limit=500")).hotels ?? [];
const bySlug = new Map(hotels.map((h) => [h.slug, h]));
let failed = 0;
for (const [slug, rooms] of Object.entries(spec.hotels)) {
  const hotel = bySlug.get(slug);
  if (!hotel) { console.log(`✗ ${slug}: otel bulunamadı`); failed++; continue; }
  try {
    const roomList = (await call("GET", `/api/manager/hotels/${hotel.id}/rooms`)).rooms;
    const roomBySlug = new Map(roomList.map((r) => [r.slug, r]));
    let periods = 0;
    for (const [roomSlug, donemler] of Object.entries(rooms)) {
      const room = roomBySlug.get(roomSlug);
      if (!room) throw new Error(`oda yok: ${roomSlug}`);
      const { revision } = await call("GET", `/api/manager/hotels/${hotel.id}/rooms/${room.id}/rates`);
      if (!dryRun) await call("PUT", `/api/manager/hotels/${hotel.id}/rooms/${room.id}/rates`, { donemler, expectedRevision: revision });
      periods += donemler.length;
    }
    // Listede kampanyası verilen otelin kampanyaları listeyle DEĞİŞTİRİLİR.
    const wanted = spec.promotions?.[slug];
    let promoCount = 0;
    if (wanted && !dryRun) {
      let { revision, promotions } = await call("GET", `/api/manager/hotels/${hotel.id}/promotions`);
      for (const old of promotions) {
        ({ revision } = await call("DELETE", `/api/manager/hotels/${hotel.id}/promotions`, { id: old.id, expectedRevision: revision }));
      }
      for (const promo of wanted) {
        ({ revision } = await call("POST", `/api/manager/hotels/${hotel.id}/promotions`, { ...promo, roomIds: [], isActive: true, expectedRevision: revision }));
        promoCount++;
      }
    } else if (wanted) promoCount = wanted.length;
    if (!dryRun) {
      await call("POST", `/api/manager/hotels/${hotel.id}/submit`, {});
      const detail = await call("GET", `/api/admin/hotels/${hotel.id}`);
      const submittedRevision = detail.hotel?.submittedRevision;
      await call("POST", `/api/admin/hotels/${hotel.id}/moderation`, { karar: "onayla", submittedRevision });
    }
    console.log(`✓ ${slug}: ${Object.keys(rooms).length} oda, ${periods} dönem${wanted ? `, ${promoCount} kampanya` : ""}${dryRun ? " (deneme)" : ", yayında"}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${slug}: ${err.message}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);

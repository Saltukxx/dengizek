/**
 * Sunum HTML'ini A4 yatay PDF'e yazar: ../../docs/dengizek-sunum.pdf
 * Kullanım (apps/web): pnpm run pdf:sunum
 * Önkoşul: pnpm exec playwright install chromium
 */
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

async function main() {
  const appWeb = path.join(__dirname, "..");
  // apps/web -> apps -> monorepo kök (dengizek)
  const repoRoot = path.join(appWeb, "..", "..");
  const htmlPath = path.join(appWeb, "public", "sunum-dengizek.html");
  const outPath = path.join(repoRoot, "docs", "dengizek-sunum.pdf");

  if (!fs.existsSync(htmlPath)) {
    console.error("Bulunamadı:", htmlPath);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const url = pathToFileURL(htmlPath).href;
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.pdf({
    path: outPath,
    format: "A4",
    landscape: true,
    printBackground: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
    preferCSSPageSize: true,
  });
  await browser.close();
  console.log("PDF yazıldı:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

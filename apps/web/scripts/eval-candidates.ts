// ---------------------------------------------------------------------------
// Gerçek misafir sorularından eval sorusu (haftalık).
//
//   npm run eval:candidates                 # son 7 günün adayları
//   npm run eval:candidates -- --days 14    # dönem
//   npm run eval:candidates -- promote .eval-cache/candidates-2026-11-07.json
//
// Adım 1 veritabanını yalnız OKUR (canlı veritabanında da çalışabilir) ve
// adayları .eval-cache/ altına yazar (git'e girmez). Dosyada onaylanacak
// soruları "approve": true yapın; isterseniz "expect" ekleyin:
//   "expect": { "contains": ["14:00"] }   ya da   "expect": { "unknown": true }
// Adım 2 onaylıları src/lib/ai/evals/real-questions.json'a ekler.
// ---------------------------------------------------------------------------

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, gte, inArray } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { analyticsEventsTable } from "../src/lib/db/schema";
import { buildCandidates, promoteCandidates, type EvalCandidate, type RealQuestionFixture } from "../src/lib/ai/eval-candidates";

const FIXTURES = path.resolve(__dirname, "../src/lib/ai/evals/real-questions.json");
const CACHE = path.resolve(__dirname, "../.eval-cache");

async function readFixtures(): Promise<RealQuestionFixture[]> {
  try {
    return JSON.parse(await readFile(FIXTURES, "utf-8")) as RealQuestionFixture[];
  } catch {
    return [];
  }
}

async function collect(days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const events = await getDb()
    .select({
      eventType: analyticsEventsTable.eventType,
      hotelSlug: analyticsEventsTable.hotelSlug,
      payload: analyticsEventsTable.payload,
      createdAt: analyticsEventsTable.createdAt,
    })
    .from(analyticsEventsTable)
    .where(and(inArray(analyticsEventsTable.eventType, ["ai_feedback", "ai_unanswered"]), gte(analyticsEventsTable.createdAt, since)));

  const candidates = buildCandidates(events, await readFixtures());
  const file = path.join(CACHE, `candidates-${new Date().toISOString().slice(0, 10)}.json`);
  await mkdir(CACHE, { recursive: true });
  await writeFile(file, `${JSON.stringify(candidates, null, 2)}\n`);
  const down = candidates.filter((c) => c.sources.down > 0).length;
  console.log(`${events.length} olay → ${candidates.length} aday (${down} tanesi 👎 almış). Dosya: ${path.relative(process.cwd(), file)}`);
  for (const c of candidates.slice(0, 10)) {
    console.log(`  ${String(c.count).padStart(3)}×  ${c.hotel}  ${c.question}${c.sources.down ? "  👎" : ""}`);
  }
  console.log(`\nOnaylamak için dosyada "approve": true yapın, sonra:\n  npm run eval:candidates -- promote ${path.relative(process.cwd(), file)}`);
}

async function promote(file: string) {
  const candidates = JSON.parse(await readFile(file, "utf-8")) as EvalCandidate[];
  const result = promoteCandidates(candidates, await readFixtures(), new Date().toISOString().slice(0, 10));
  await writeFile(FIXTURES, `${JSON.stringify(result.fixtures, null, 2)}\n`);
  console.log(`${result.added.length} soru eklendi (toplam ${result.fixtures.length}).`);
  for (const r of result.rejected) console.log(`  ✗ ${r.id}: ${r.reason}`);
  if (result.added.length) console.log("Koşmak için: npm run test:eval:real");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "promote") {
    if (!args[1]) throw new Error("Kullanım: eval-candidates promote <adaylar.json>");
    await promote(args[1]);
  } else {
    const at = args.indexOf("--days");
    await collect(at >= 0 ? Number(args[at + 1]) || 7 : 7);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

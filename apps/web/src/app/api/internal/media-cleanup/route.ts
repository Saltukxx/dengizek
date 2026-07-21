import { timingSafeEqual } from "node:crypto";
import { apiFail, apiOk } from "@/lib/api-response";
import { cleanupMediaObjects } from "@/lib/media-cleanup";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return apiFail("Yetkisiz.", 401);
  }
  return apiOk(await cleanupMediaObjects());
}

export const GET = POST;

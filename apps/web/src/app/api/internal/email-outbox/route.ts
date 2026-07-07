import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { deliverPendingEmails } from "@/lib/email";

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  const provided = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return NextResponse.json({ ok: false, error: "Yetkisiz." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, ...(await deliverPendingEmails()) });
}

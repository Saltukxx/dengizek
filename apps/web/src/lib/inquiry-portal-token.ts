import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db, Tx } from "@/lib/db";
import { inquiriesTable } from "@/lib/db/schema";

type DbLike = Db | Tx;
export const PORTAL_TOKEN_DAYS = 90;

export function generatePortalToken() { return randomBytes(32).toString("base64url"); }
export function hashPortalToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function portalTokenExpiry() { return new Date(Date.now() + PORTAL_TOKEN_DAYS * 86_400_000); }

export async function rotateInquiryPortalToken(db: DbLike, inquiryId: string) {
  const token = generatePortalToken();
  await db.update(inquiriesTable).set({
    accessTokenHash: hashPortalToken(token),
    accessTokenExpiresAt: portalTokenExpiry(),
    accessTokenRevokedAt: null,
  }).where(eq(inquiriesTable.id, inquiryId));
  return token;
}

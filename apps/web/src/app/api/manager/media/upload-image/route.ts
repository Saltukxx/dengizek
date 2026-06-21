// ---------------------------------------------------------------------------
// POST /api/manager/media/upload-image — otel kapsamlı yerel görsel yükleme
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireHotelAccess } from "@/lib/auth/guards";
import { apiFail, apiOk } from "@/lib/api-response";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(req: Request) {
  const url = new URL(req.url);
  const hotelIdFromQuery = url.searchParams.get("hotelId");

  const form = await req.formData().catch(() => null);
  const hotelId = (form?.get("hotelId") as string | null) ?? hotelIdFromQuery;

  if (!hotelId) {
    return apiFail("hotelId gerekli.", 400);
  }

  const guard = await requireHotelAccess(hotelId);
  if (guard.response) return guard.response;

  const file = form?.get("file");
  if (!(file instanceof File)) {
    return apiFail("Dosya gerekli.", 400);
  }
  if (!ALLOWED.has(file.type)) {
    return apiFail("Desteklenmeyen dosya türü.", 400);
  }
  if (file.size > MAX_BYTES) {
    return apiFail("Dosya en fazla 5 MB olabilir.", 400);
  }

  const ext = file.type === "image/png" ? "png"
    : file.type === "image/webp" ? "webp"
    : file.type === "image/gif" ? "gif"
    : "jpg";
  const name = `${randomUUID()}.${ext}`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads", guard.hotel.id);
  await mkdir(uploadsDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadsDir, name), buffer);

  return apiOk({ url: `/uploads/${guard.hotel.id}/${name}` });
}

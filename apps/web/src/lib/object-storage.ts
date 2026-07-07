import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "image/gif": (b) => ["GIF87a", "GIF89a"].includes(String.fromCharCode(...b.slice(0, 6))),
};

export function hasValidImageSignature(contentType: string, bytes: Uint8Array) {
  return signatures[contentType]?.(bytes) ?? false;
}

export async function storeImage(hotelId: string, contentType: string, bytes: Uint8Array) {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : "jpg";
  const key = `hotels/${hotelId}/${randomUUID()}.${ext}`;
  const uploadBase = process.env.OBJECT_STORAGE_UPLOAD_URL;
  const publicBase = process.env.OBJECT_STORAGE_PUBLIC_URL;
  if (uploadBase && publicBase) {
    const res = await fetch(`${uploadBase.replace(/\/$/, "")}/${key}`, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        ...(process.env.OBJECT_STORAGE_TOKEN ? { Authorization: `Bearer ${process.env.OBJECT_STORAGE_TOKEN}` } : {}),
      },
      body: Buffer.from(bytes),
    });
    if (!res.ok) throw new Error(`Object storage upload failed (${res.status})`);
    return `${publicBase.replace(/\/$/, "")}/${key}`;
  }
  if (process.env.NODE_ENV === "production") throw new Error("OBJECT_STORAGE_NOT_CONFIGURED");
  const dir = path.join(process.cwd(), "public", "uploads", hotelId);
  await mkdir(dir, { recursive: true });
  const name = key.split("/").at(-1)!;
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${hotelId}/${name}`;
}

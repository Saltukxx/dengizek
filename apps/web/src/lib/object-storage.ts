import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const signatures: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/webp": (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP",
  "image/gif": (b) => ["GIF87a", "GIF89a"].includes(String.fromCharCode(...b.slice(0, 6))),
};

export type StoredObject = { key: string; url: string };

export function hasValidImageSignature(contentType: string, bytes: Uint8Array) {
  return signatures[contentType]?.(bytes) ?? false;
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function r2Config() {
  const endpoint = process.env.R2_ENDPOINT ?? (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  const bucket = process.env.R2_BUCKET_NAME;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBase = process.env.R2_PUBLIC_URL;
  if (!endpoint || !bucket || !accessKey || !secretKey || !publicBase) return null;
  return { endpoint: endpoint.replace(/\/$/, ""), bucket, accessKey, secretKey, publicBase: publicBase.replace(/\/$/, "") };
}

async function signedR2Request(method: "PUT" | "DELETE", key: string, body?: Uint8Array, contentType?: string) {
  const config = r2Config();
  if (!config) throw new Error("R2_NOT_CONFIGURED");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`${config.endpoint}/${config.bucket}/${encodedKey}`);
  const payloadHash = sha256(body ?? new Uint8Array());
  const headers: Record<string, string> = {
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join("");
  const canonicalRequest = [method, url.pathname, "", canonicalHeaders, signedHeaderNames.join(";"), payloadHash].join("\n");
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${config.secretKey}`, date), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKey}/${scope}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`;
  const response = await fetch(url, {
    method,
    headers: { ...headers, Authorization: authorization },
    body: body ? Buffer.from(body) : undefined,
  });
  if (!response.ok) throw new Error(`R2_${method}_FAILED_${response.status}`);
}

export async function storeImage(hotelId: string, contentType: string, bytes: Uint8Array): Promise<StoredObject> {
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : contentType === "image/gif" ? "gif" : "jpg";
  const key = `hotels/${hotelId}/${randomUUID()}.${ext}`;
  const config = r2Config();
  if (config) {
    await signedR2Request("PUT", key, bytes, contentType);
    return { key, url: `${config.publicBase}/${key}` };
  }
  if (process.env.NODE_ENV === "production") throw new Error("R2_NOT_CONFIGURED");
  const dir = path.join(process.cwd(), "public", "uploads", hotelId);
  await mkdir(dir, { recursive: true });
  const name = key.split("/").at(-1)!;
  await writeFile(path.join(dir, name), bytes);
  return { key, url: `/uploads/${hotelId}/${name}` };
}

export async function deleteObject(key: string) {
  if (!key.startsWith("hotels/")) throw new Error("INVALID_OBJECT_KEY");
  if (r2Config()) return signedR2Request("DELETE", key);
  if (process.env.NODE_ENV === "production") throw new Error("R2_NOT_CONFIGURED");
  await unlink(path.join(process.cwd(), "public", "uploads", ...key.split("/").slice(1))).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

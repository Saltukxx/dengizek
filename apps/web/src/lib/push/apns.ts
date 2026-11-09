// ---------------------------------------------------------------------------
// Apple Push Notification service (APNs) — iOS uygulamasına bildirim.
//
// Token tabanlı kimlik: Apple Developer hesabındaki .p8 anahtarıyla ES256
// imzalı JWT (55 dk önbellekte; Apple 20–60 dk arası yenilenmesini ister).
// APNs yalnız HTTP/2 konuşur; Node'un fetch'i HTTP/2 desteklemediği için
// node:http2 kullanılır. Ayar yoksa hiçbir şey gönderilmez (isApnsConfigured).
// ---------------------------------------------------------------------------

import { createPrivateKey, sign } from "node:crypto";
import { connect } from "node:http2";

export type ApnsEnvironment = "sandbox" | "production";

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  /** .p8 dosyasının içeriği (satır sonları "\n" kaçışıyla da verilebilir). */
  privateKey: string;
  bundleId: string;
}

export interface ApnsAlert {
  title: string;
  body: string;
  /** Uygulamaya taşınan ek veri (ör. portalUrl). */
  data?: Record<string, string>;
}

export type ApnsResult =
  | { ok: true }
  /** Cihaz kimliği artık geçersiz: kayıt silinmeli. */
  | { ok: false; unregistered: true; status: number; reason?: string }
  | { ok: false; unregistered: false; status: number; reason?: string };

const HOSTS: Record<ApnsEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

const TOKEN_TTL_MS = 55 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 8000;

export function apnsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim();
  const teamId = env.APNS_TEAM_ID?.trim();
  const privateKey = env.APNS_PRIVATE_KEY?.trim();
  const bundleId = env.APNS_BUNDLE_ID?.trim();
  if (!keyId || !teamId || !privateKey || !bundleId) return null;
  return { keyId, teamId, privateKey: privateKey.replace(/\\n/g, "\n"), bundleId };
}

export function isApnsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return apnsConfigFromEnv(env) !== null;
}

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

/** APNs sağlayıcı JWT'si (ES256). Testte doğrulanabilsin diye dışa açık. */
export function buildProviderToken(config: ApnsConfig, issuedAtSec = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: issuedAtSec }));
  const signingInput = `${header}.${claims}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

let cachedToken: { value: string; keyId: string; expiresAt: number } | null = null;

function providerToken(config: ApnsConfig): string {
  const now = Date.now();
  if (cachedToken && cachedToken.keyId === config.keyId && cachedToken.expiresAt > now) return cachedToken.value;
  const value = buildProviderToken(config);
  cachedToken = { value, keyId: config.keyId, expiresAt: now + TOKEN_TTL_MS };
  return value;
}

export function buildAlertPayload(alert: ApnsAlert): string {
  return JSON.stringify({
    aps: { alert: { title: alert.title, body: alert.body }, sound: "default" },
    ...alert.data,
  });
}

/** Tek bir cihaza bildirim. Asla fırlatmaz; sonucu döner. */
export async function sendApns(
  config: ApnsConfig,
  deviceToken: string,
  environment: ApnsEnvironment,
  alert: ApnsAlert,
): Promise<ApnsResult> {
  const payload = buildAlertPayload(alert);
  return new Promise<ApnsResult>((resolve) => {
    let settled = false;
    const finish = (result: ApnsResult) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };
    const client = connect(HOSTS[environment]);
    client.on("error", () => finish({ ok: false, unregistered: false, status: 0, reason: "connection" }));
    client.setTimeout(REQUEST_TIMEOUT_MS, () => finish({ ok: false, unregistered: false, status: 0, reason: "timeout" }));

    const request = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken(config)}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    request.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => {
      body += chunk;
    });
    request.on("end", () => {
      if (status === 200) return finish({ ok: true });
      let reason: string | undefined;
      try {
        reason = (JSON.parse(body) as { reason?: string }).reason;
      } catch {
        reason = undefined;
      }
      const unregistered = status === 410 || reason === "BadDeviceToken" || reason === "Unregistered";
      finish({ ok: false, unregistered, status, reason } as ApnsResult);
    });
    request.on("error", () => finish({ ok: false, unregistered: false, status, reason: "stream" }));
    request.end(payload);
  });
}

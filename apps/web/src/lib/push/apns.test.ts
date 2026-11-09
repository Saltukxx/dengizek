import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { apnsConfigFromEnv, buildAlertPayload, buildProviderToken } from "./apns";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const config = { keyId: "ABC123DEFG", teamId: "TEAM123456", privateKey: pem, bundleId: "com.gbsoft.otelsayfam" };

describe("APNs", () => {
  it("ES256 sağlayıcı JWT'si: başlık, iddialar ve imza doğrulanır", () => {
    const token = buildProviderToken(config, 1_800_000_000);
    const [header, claims, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: "TEAM123456", iat: 1_800_000_000 });
    const ok = verify("sha256", Buffer.from(`${header}.${claims}`), { key: createPublicKey(privateKey), dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });

  it("bildirim gövdesi: aps.alert + uygulamaya taşınan veri", () => {
    const payload = JSON.parse(buildAlertPayload({ title: "Başlık", body: "Metin", data: { portalUrl: "https://x/p/1" } }));
    expect(payload).toEqual({ aps: { alert: { title: "Başlık", body: "Metin" }, sound: "default" }, portalUrl: "https://x/p/1" });
  });

  it("ayar eksikse kapalı; .p8 satır sonu kaçışını çözer", () => {
    expect(apnsConfigFromEnv({ APNS_KEY_ID: "a" } as unknown as NodeJS.ProcessEnv)).toBeNull();
    const parsed = apnsConfigFromEnv({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t", APNS_PRIVATE_KEY: "-----BEGIN\\nX\\n-----END", APNS_BUNDLE_ID: "b" } as unknown as NodeJS.ProcessEnv);
    expect(parsed?.privateKey).toBe("-----BEGIN\nX\n-----END");
  });
});

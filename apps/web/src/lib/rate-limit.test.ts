import { afterEach, describe, expect, it, vi } from "vitest";
import { requestIp } from "./rate-limit";

function req(headers: Record<string, string>) {
  return new Request("http://localhost/api/x", { headers });
}

describe("requestIp — sahte başlığa karşı dayanıklı IP", () => {
  it("nginx'in ezdiği X-Real-IP önceliklidir", () => {
    expect(requestIp(req({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "1.2.3.4" }))).toBe("203.0.113.5");
  });

  it("X-Forwarded-For'da istemcinin uydurduğu ilk değil, vekilin eklediği SON değer alınır", () => {
    // İstemci "9.9.9.9" uydurur; nginx gerçek adresini (198.51.100.7) sona ekler.
    expect(requestIp(req({ "x-forwarded-for": "9.9.9.9, 198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("tek değerli X-Forwarded-For olduğu gibi döner", () => {
    expect(requestIp(req({ "x-forwarded-for": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("boş parçalar atlanır", () => {
    expect(requestIp(req({ "x-forwarded-for": "9.9.9.9, , 198.51.100.7, " }))).toBe("198.51.100.7");
  });

  it("hiçbir başlık yoksa 'unknown'", () => {
    expect(requestIp(req({}))).toBe("unknown");
  });
});

describe("RATE_LIMIT_MEMORY (yalnız geliştirme)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("geliştirmede açıkken veritabanına gitmeden bellekte sayar", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RATE_LIMIT_MEMORY", "true");
    vi.stubEnv("DATABASE_URL", "postgres://x@127.0.0.1:1/yok");
    const { checkRateLimit } = await import("./rate-limit");
    const options = { name: `bellek-${Math.random()}`, windowMs: 60_000, limit: 2, failClosed: true };
    expect(await checkRateLimit("ip", options)).toBe(true);
    expect(await checkRateLimit("ip", options)).toBe(true);
    expect(await checkRateLimit("ip", options)).toBe(false);
  });
});

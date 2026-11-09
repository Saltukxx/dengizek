import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args),
  requestIp: () => "1.2.3.4",
}));

import { POST } from "./route";

const fetchMock = vi.fn();

function speakRequest(body: unknown) {
  return new Request("http://localhost/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Piper'ın döndürdüğü gibi: WAV gövdesi, ama "text/html" başlığıyla. */
function wavResponse() {
  const bytes = new Uint8Array(64);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WAVE"), 8);
  return new Response(bytes, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

beforeEach(() => {
  vi.stubEnv("PIPER_URL", "http://piper:5000/");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  checkRateLimitMock.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/voice/speak", () => {
  it("metni Piper'a iletir ve WAV döndürür", async () => {
    fetchMock.mockResolvedValue(wavResponse());
    const res = await POST(speakRequest({ text: "  Kahvaltı dahildir.  " }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect((await res.arrayBuffer()).byteLength).toBe(64);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://piper:5000/synthesize");
    expect(JSON.parse(init.body)).toEqual({ text: "Kahvaltı dahildir." });
  });

  it("PIPER_URL yoksa 503 döner (istemci tarayıcı sesine düşer)", async () => {
    vi.stubEnv("PIPER_URL", "");
    const res = await POST(speakRequest({ text: "Merhaba." }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("boş ya da çok uzun metni reddeder", async () => {
    expect((await POST(speakRequest({ text: "   " }))).status).toBe(400);
    expect((await POST(speakRequest({ text: "a".repeat(401) }))).status).toBe(400);
    expect((await POST(speakRequest({}))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hız sınırı aşılınca 429 döner", async () => {
    checkRateLimitMock.mockResolvedValue(false);
    const res = await POST(speakRequest({ text: "Merhaba." }));
    expect(res.status).toBe(429);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Piper'a ulaşılamazsa 502 döner", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    expect((await POST(speakRequest({ text: "Merhaba." }))).status).toBe(502);
  });

  it("Piper hata ya da ses olmayan içerik döndürürse 502 döner", async () => {
    fetchMock.mockResolvedValueOnce(new Response("hata", { status: 500 }));
    expect((await POST(speakRequest({ text: "Merhaba." }))).status).toBe(502);

    fetchMock.mockResolvedValueOnce(new Response("<html>not audio</html>", { status: 200 }));
    expect((await POST(speakRequest({ text: "Merhaba." }))).status).toBe(502);
  });
});

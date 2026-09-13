import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireHotelAccess: vi.fn(),
  hasValidImageSignature: vi.fn(),
  hasSafeImageDimensions: vi.fn(),
  storeImage: vi.fn(),
}));

vi.mock("@/lib/auth/guards", () => ({ requireHotelAccess: mocks.requireHotelAccess }));
vi.mock("@/lib/object-storage", () => ({
  hasValidImageSignature: mocks.hasValidImageSignature,
  hasSafeImageDimensions: mocks.hasSafeImageDimensions,
  storeImage: mocks.storeImage,
}));

import { POST } from "./route";

function makeRequest(form?: FormData, query = "") {
  const request = new Request(`http://localhost/api/manager/media/upload-image${query}`, {
    method: "POST",
    body: form,
  });
  // Request.formData() Node'un kendi File sınıfını üretirken route jsdom'un
  // global File sınıfını kontrol ediyor. Tarayıcının gönderdiği FormData'yı
  // doğrudan döndürerek gerçek route dalını realm farkı olmadan sınarız.
  if (form) vi.spyOn(request, "formData").mockResolvedValue(form);
  return request;
}

function imageFile(type = "image/png", bytes: Uint8Array = new Uint8Array([0x89, 0x50, 0x4e, 0x47])) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const file = new File([buffer], "hotel.png", { type });
  Object.defineProperty(file, "arrayBuffer", {
    value: vi.fn(async () => buffer.slice(0)),
  });
  return file;
}

function imageForm(file: File = imageFile(), hotelId = "hotel-route") {
  const form = new FormData();
  form.append("hotelId", hotelId);
  form.append("file", file);
  return form;
}

describe("POST /api/manager/media/upload-image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireHotelAccess.mockResolvedValue({
      response: null,
      hotel: { id: "hotel-db" },
      user: { id: "user-1" },
    });
    mocks.hasValidImageSignature.mockReturnValue(true);
    mocks.hasSafeImageDimensions.mockReturnValue(true);
    mocks.storeImage.mockResolvedValue({
      key: "hotels/hotel-db/image.png",
      url: "https://cdn.test/hotel.png",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hotelId olmadan guard veya depolamaya dokunmadan 400 döner", async () => {
    const res = await POST(makeRequest());

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "hotelId gerekli." });
    expect(mocks.requireHotelAccess).not.toHaveBeenCalled();
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("hotelId query string'den geldiğinde de tenant erişimini kontrol eder", async () => {
    const form = new FormData();
    form.append("file", imageFile());

    const res = await POST(makeRequest(form, "?hotelId=hotel-query"));

    expect(res.status).toBe(200);
    expect(mocks.requireHotelAccess).toHaveBeenCalledWith("hotel-query");
    expect(mocks.storeImage).toHaveBeenCalledWith(
      "hotel-db",
      "image/png",
      expect.any(Buffer),
    );
  });

  it("yetkisiz erişimde guard yanıtını döndürür ve dosyayı okumaz", async () => {
    const denied = NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 403 });
    mocks.requireHotelAccess.mockResolvedValue({ response: denied });

    const res = await POST(makeRequest(imageForm()));

    expect(res.status).toBe(403);
    expect(mocks.hasValidImageSignature).not.toHaveBeenCalled();
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("dosya eksikse 400 döner", async () => {
    const form = new FormData();
    form.append("hotelId", "hotel-route");

    const res = await POST(makeRequest(form));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Dosya gerekli." });
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("izin verilmeyen MIME türünü içerik kontrolünden önce reddeder", async () => {
    const res = await POST(makeRequest(imageForm(imageFile("image/svg+xml"))));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Desteklenmeyen dosya türü." });
    expect(mocks.hasValidImageSignature).not.toHaveBeenCalled();
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("5 MB sınırını aşan dosyayı reddeder", async () => {
    const oversized = imageFile("image/png", new Uint8Array(5 * 1024 * 1024 + 1));

    const res = await POST(makeRequest(imageForm(oversized)));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "Dosya en fazla 5 MB olabilir." });
    expect(mocks.hasValidImageSignature).not.toHaveBeenCalled();
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("MIME ile magic-byte imzası uyuşmayan dosyayı reddeder", async () => {
    mocks.hasValidImageSignature.mockReturnValue(false);

    const res = await POST(makeRequest(imageForm()));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: "Dosya içeriği görsel türüyle eşleşmiyor.",
    });
    expect(mocks.hasSafeImageDimensions).not.toHaveBeenCalled();
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("piksel bombası olarak değerlendirilen görseli depolamaz", async () => {
    mocks.hasSafeImageDimensions.mockReturnValue(false);

    const res = await POST(makeRequest(imageForm()));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining("50 MP") });
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("doğrulanmış buffer'ı guard'ın döndürdüğü otel kimliğiyle depolar", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

    const res = await POST(makeRequest(imageForm(imageFile("image/png", bytes))));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      url: "https://cdn.test/hotel.png",
      objectKey: "hotels/hotel-db/image.png",
    });
    expect(mocks.hasValidImageSignature).toHaveBeenCalledWith("image/png", expect.any(Buffer));
    expect(mocks.hasSafeImageDimensions).toHaveBeenCalledWith("image/png", expect.any(Buffer));
    expect(mocks.storeImage).toHaveBeenCalledWith("hotel-db", "image/png", expect.any(Buffer));
    const storedBuffer = mocks.storeImage.mock.calls[0][2] as Buffer;
    expect([...storedBuffer]).toEqual([...bytes]);
  });

  it("depolama hatasını ayrıntı sızdırmadan 503'e çevirir", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.storeImage.mockRejectedValue(new Error("R2 credentials leaked detail"));

    const res = await POST(makeRequest(imageForm()));

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "Görsel depolama servisi kullanılamıyor.",
      code: "STORAGE_UNAVAILABLE",
    });
    expect(consoleError).toHaveBeenCalledOnce();
  });
});

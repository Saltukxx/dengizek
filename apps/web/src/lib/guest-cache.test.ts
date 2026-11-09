import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const unstableCache = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>, keyParts: string[], opts: unknown) => {
    unstableCache(keyParts, opts);
    return fn;
  },
  revalidateTag: (tag: string) => revalidateTag(tag),
}));

import { GUEST_HOTEL_LIST_TAG, guestCached, guestHotelTag, revalidateGuestHotel } from "@/lib/guest-cache";

describe("misafir önbelleği", () => {
  beforeEach(() => {
    unstableCache.mockClear();
    revalidateTag.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  const load = guestCached("otel", async (slug: string) => `veri:${slug}`, (slug) => [guestHotelTag(slug)]);

  it("geliştirmede ve Next dışında önbellek atlanır", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    expect(await load("a")).toBe("veri:a");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "");
    expect(await load("a")).toBe("veri:a");
    expect(unstableCache).not.toHaveBeenCalled();
    revalidateGuestHotel("a");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("production'da otel etiketiyle ve süreyle önbelleğe alınır", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    expect(await load("kar-zirvesi")).toBe("veri:kar-zirvesi");
    expect(unstableCache).toHaveBeenCalledWith(["otel", '["kar-zirvesi"]'], {
      tags: ["misafir-otel:kar-zirvesi"],
      revalidate: 600,
    });
  });

  it("GUEST_DATA_CACHE=off önbelleği kapatır", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("GUEST_DATA_CACHE", "off");
    await load("a");
    expect(unstableCache).not.toHaveBeenCalled();
  });

  it("yenileme listeyi ve oteli birlikte yeniler", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    revalidateGuestHotel("a", "a", null);
    expect(revalidateTag.mock.calls.map(([t]) => t)).toEqual([GUEST_HOTEL_LIST_TAG, "misafir-otel:a"]);
  });
});

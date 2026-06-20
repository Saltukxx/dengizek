import { describe, expect, it } from "vitest";
import { parseTourManifest, safeParseTourManifest } from "./tour-manifest";
import rawDemo from "@/lib/mocks/demo-tour.json";

describe("tourManifestSchema", () => {
  it("parses demo JSON", () => {
    const m = parseTourManifest(rawDemo);
    expect(m.tourId).toBe("demo-lobby");
    expect(m.version).toBeGreaterThanOrEqual(2);
    expect(m.steps.length).toBeGreaterThan(0);
    const s1 = m.steps[0];
    if (s1?.callouts?.length) {
      expect(s1.callouts[0]?.title).toBeDefined();
    }
  });

  it("rejects invalid shapes", () => {
    const r = safeParseTourManifest({ not: "a manifest" });
    expect(r.success).toBe(false);
  });

  it("parses AI metadata fields on steps", () => {
    const m = parseTourManifest(rawDemo);
    const s1 = m.steps[0]!;
    // demo-tour.json'da AI alanları dolu olmalı
    expect(Array.isArray(s1.aiTags)).toBe(true);
    expect(typeof s1.aiDescription).toBe("string");
  });

  it("parses hotelProfile when present", () => {
    const m = parseTourManifest(rawDemo);
    expect(m.hotelProfile).toBeDefined();
    expect(m.hotelProfile?.aiPersona).toBeTruthy();
  });

  it("accepts steps without AI fields (backward compat)", () => {
    const minimal = {
      tourId: "t1",
      hotelSlug: "test",
      version: 1,
      steps: [
        {
          stepId: "s1",
          order: 0,
          kind: "lobby",
          title: "Lobi",
          requiresUserContinue: false,
          media: { mode: "clip", src: "/demo/clip.mp4" },
        },
      ],
    };
    const r = safeParseTourManifest(minimal);
    expect(r.success).toBe(true);
  });

  it("aiVisible defaults to undefined (treated as true by consumer)", () => {
    const m = parseTourManifest(rawDemo);
    // Adımlarda aiVisible ya true ya da undefined olmalı, false olmamalı (demo'da)
    m.steps.forEach((s) => {
      expect(s.aiVisible).not.toBe(false);
    });
  });
});

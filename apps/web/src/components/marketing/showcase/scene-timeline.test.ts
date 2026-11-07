import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SHOWCASE_CONFIGS } from "@/lib/marketing/showcase-config";
import { STILL_TIME, T, sceneAt } from "./scene-timeline";

const dialog = {
  question: "Termal havuz kaç derece?",
  answer: "Havuzlarımız 35-38 derece sıcaklık arasındadır.",
  cardLabel: "Otel ifadesi",
  hotelName: "Örnek Termal",
};
const script = SHOWCASE_CONFIGS.termal.script;

describe("vitrin banner sahnesi zaman çizelgesi", () => {
  it("başta yalnız ilk durak ve boş sohbet", () => {
    const f = sceneAt(0, dialog, script);
    expect(f.stop).toBe(0);
    expect(f.messages).toEqual([]);
    expect(f.thinking).toBe(false);
  });

  it("soru harf harf yazılır, sonra rehber düşünür", () => {
    const typing = sceneAt(T.question + 200, dialog, script);
    expect(typing.messages[0]).toMatchObject({ role: "guest", typing: true });
    expect(dialog.question.startsWith(typing.messages[0]!.text)).toBe(true);
    expect(typing.messages[0]!.text.length).toBeLessThan(dialog.question.length);
    expect(sceneAt(T.thinkingEnd - 100, dialog, script).thinking).toBe(true);
  });

  it("cevap gerçek diyalogdan gelir, kart kaynağı otelin adını taşır", () => {
    const f = sceneAt(STILL_TIME, dialog, script);
    const answer = f.messages.find((m) => m.id === "a1");
    expect(answer?.text).toBe(dialog.answer);
    expect(answer?.card).toEqual({ label: "Otel ifadesi", source: "Örnek Termal", text: dialog.answer });
  });

  it("takip sorusu ikinci durağa, 'Oteli gezdir' üçüncüye götürür", () => {
    const f1 = sceneAt(T.stop1 + 10, dialog, script);
    expect(f1.stop).toBe(1);
    expect(f1.messages.find((m) => m.id === "q2")?.text).toBe("Spayı göster");
    expect(f1.messages.find((m) => m.id === "a2")?.text).toBe(script.followUpReply);
    const f2 = sceneAt(T.stop2 + 10, dialog, script);
    expect(f2.stop).toBe(2);
    expect(f2.messages.find((m) => m.id === "a3")?.text).toBe(script.autoTourReply);
    expect(sceneAt(T.autoTour + 10, dialog, script).autoTourPressed).toBe(true);
  });

  it("her yüzeyde takip sorusu ikinci durak açılmadan yazılmış olur", () => {
    for (const config of Object.values(SHOWCASE_CONFIGS)) {
      const before = sceneAt(T.stop1 - 1, dialog, config.script);
      expect(before.messages.find((m) => m.id === "q2"), config.surface).toMatchObject({
        text: config.script.followUp,
        typing: false,
      });
    }
  });

  it("durak ilerlemesi 0–1 arasında, döngü başa sarar", () => {
    for (let t = 0; t < T.total; t += 250) {
      const { stopProgress } = sceneAt(t, dialog, script);
      expect(stopProgress).toBeGreaterThanOrEqual(0);
      expect(stopProgress).toBeLessThanOrEqual(1);
    }
    expect(sceneAt(T.fade + 10, dialog, script).fading).toBe(true);
    expect(sceneAt(T.total + 5, dialog, script)).toEqual(sceneAt(5, dialog, script));
  });
});

describe("vitrin ayarları", () => {
  it("her yüzeyin üç durağı, videosu ve konuya bağlı demo soruları var", () => {
    for (const config of Object.values(SHOWCASE_CONFIGS)) {
      expect(config.script.stops).toHaveLength(3);
      for (const stop of config.script.stops) {
        expect(stop.media).toMatch(new RegExp(`^/marketing/${config.surface}/`));
        for (const ext of [".mp4", ".jpg"]) {
          expect(existsSync(path.join(process.cwd(), "public", `${stop.media}${ext}`)), `${stop.media}${ext}`).toBe(true);
        }
      }
      expect(existsSync(path.join(process.cwd(), "public", "marketing", config.surface, "KAYNAKLAR.md"))).toBe(true);
      expect(config.demoQuestions.length).toBeGreaterThan(0);
      for (const q of config.demoQuestions) expect(q.accept.length).toBeGreaterThan(0);
    }
  });
});

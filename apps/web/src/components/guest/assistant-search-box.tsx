import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import { guestPaths, type GuestSurface } from "@/lib/guest-surface";

/** Vitrine göre örnek aramalar — arama asistanının gerçekten anladığı türden. */
export const ASSISTANT_EXAMPLES: Record<GuestSurface, readonly string[]> = {
  yaz: ["Özel plajı olan otel", "Çocuk havuzu ve her şey dahil otel", "Havalimanına yakın otel"],
  kis: ["Uludağ'da spa'sı olan otel", "Kapalı havuzu olan otel", "Evcil hayvan kabul eden otel"],
  termal: ["Afyon'da çocuk havuzu olan otel", "Spor salonu ve hamamı olan otel", "Denizli'de jakuzili otel"],
};

/**
 * Arama asistanına giriş — ana sayfada ve otel listesinin banner'ında.
 * Misafir isteğini kendi cümlesiyle yazar; sonuçlar bulunduğu vitrinin
 * arama sayfasında (/otel-bul, /termal/otel-bul, /kis/otel-bul) açılır.
 */
export function AssistantSearchBox({ compact = false, surface = "yaz" }: { compact?: boolean; surface?: GuestSurface }) {
  const finder = guestPaths(surface).finder;
  const examples = ASSISTANT_EXAMPLES[surface];
  return (
    <section className="er-card" style={{ padding: compact ? 16 : 24 }} aria-labelledby="assistant-search-title">
      <p id="assistant-search-title" className={compact ? undefined : "er-display"} style={{ margin: 0, fontWeight: 600, fontSize: compact ? 15 : 20, display: "flex", alignItems: "center", gap: 8 }}>
        <IconSparkles size={compact ? 16 : 20} color="var(--er-primary)" aria-hidden />
        Aradığınız oteli anlatın, biz bulalım
      </p>
      {compact ? null : (
        <p style={{ margin: "6px 0 0", color: "var(--er-text-muted)", fontSize: 14 }}>
          Şehir, olanak, oda büyüklüğü, pansiyon tipi ya da otelin adını kendi cümlenizle yazın.
        </p>
      )}
      <form method="GET" action={finder} className="er-search-bar" style={{ marginTop: 12 }}>
        <div className="er-input-icon" style={{ gridColumn: "span 3" }}>
          <IconSparkles size={18} className="er-icon" aria-hidden />
          <input name="q" maxLength={200} className="er-input" placeholder={`Örn. ${examples[0]}`} aria-label="Aradığınız otel" autoComplete="off" />
        </div>
        <button type="submit" className="er-btn er-btn-primary">Asistana sor</button>
      </form>
      {compact ? null : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {examples.map((example) => (
            <Link key={example} href={`${finder}?q=${encodeURIComponent(example)}`} className="er-chip">
              {example}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

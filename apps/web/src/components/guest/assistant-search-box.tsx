import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";

const EXAMPLES = ["Afyon'da çocuk havuzu olan otel", "Spor salonu ve hamamı olan otel", "Havalimanına yakın otel"];

/**
 * Arama asistanına giriş — ana sayfada ve otel listesinin üstünde.
 * Misafir isteğini kendi cümlesiyle yazar; /otel-bul sonuçları gösterir.
 */
export function AssistantSearchBox({ compact = false }: { compact?: boolean }) {
  return (
    <section className="er-card" style={{ padding: compact ? 16 : 24 }} aria-labelledby="assistant-search-title">
      <p id="assistant-search-title" className={compact ? undefined : "er-display"} style={{ margin: 0, fontWeight: 600, fontSize: compact ? 15 : 20, display: "flex", alignItems: "center", gap: 8 }}>
        <IconSparkles size={compact ? 16 : 20} color="var(--er-primary)" aria-hidden />
        Aradığınız oteli anlatın, biz bulalım
      </p>
      {compact ? null : (
        <p style={{ margin: "6px 0 0", color: "var(--er-text-muted)", fontSize: 14 }}>
          Şehir, olanak, oda büyüklüğü ya da pansiyon tipini kendi cümlenizle yazın.
        </p>
      )}
      <form method="GET" action="/otel-bul" className="er-search-bar" style={{ marginTop: 12 }}>
        <div className="er-input-icon" style={{ gridColumn: "span 3" }}>
          <IconSparkles size={18} className="er-icon" aria-hidden />
          <input name="q" maxLength={200} className="er-input" placeholder="Örn. Afyon'da çocuk havuzu olan otel" aria-label="Aradığınız otel" autoComplete="off" />
        </div>
        <button type="submit" className="er-btn er-btn-primary">Asistana sor</button>
      </form>
      {compact ? null : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {EXAMPLES.map((example) => (
            <Link key={example} href={`/otel-bul?q=${encodeURIComponent(example)}`} className="er-chip">
              {example}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

import Image from "next/image";
import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { getPublishedHotelsForBrowse } from "@/lib/hotels-repo";

/** Şerit başına foto sayısı — iki şerit, ters yönlere kayar. */
const PER_STRIP = 9;
/** Bundan az fotoğraf varsa şerit gösterilmez (tekrar eden kısa şerit kötü durur). */
const MIN_PHOTOS = 6;

const STEPS = [
  { title: "Turunuzu yükleyin", body: "Odalarınızın, havuzunuzun, restoranınızın videolarını panelden yükleyip duraklı tura dönüştürün." },
  { title: "Rehber hazır olur", body: "Panelde girdiğiniz bilgilerle yapay zekâ rehberi misafir sorularını cevaplar." },
  { title: "Talepler size gelir", body: "Misafir talebi panelinize düşer, cevabınızı oradan verirsiniz." },
] as const;

function Strip({ photos, reverse }: { photos: string[]; reverse?: boolean }) {
  // Kesintisiz döngü için liste iki kez dizilir; animasyon yarısı kadar kayar.
  const loop = [...photos, ...photos];
  return (
    <div className="ob-strip" data-reverse={reverse || undefined} aria-hidden>
      <div className="ob-track">
        {loop.map((src, i) => (
          <Image key={`${src}-${i}`} src={src} alt="" width={200} height={128} sizes="(max-width: 56em) 150px, 200px" />
        ))}
      </div>
    </div>
  );
}

/**
 * Otel sahiplerine dönük kapanış bandı — yaz, kış ve termal ana sayfalarında.
 * Fotoğraflar ve sayı sitedeki gerçek yayındaki otellerden gelir.
 */
export async function OwnerBand() {
  const hotels = await getPublishedHotelsForBrowse();
  const photos = [...new Set(hotels.map((h) => h.imageUrl).filter((u): u is string => Boolean(u)))];
  const showStrips = photos.length >= MIN_PHOTOS;
  const top = photos.slice(0, PER_STRIP);
  const bottom = photos.length > PER_STRIP ? photos.slice(PER_STRIP, PER_STRIP * 2) : [...top].reverse();

  return (
    <section className="ob" aria-labelledby="ob-title">
      {showStrips ? <Strip photos={top} /> : null}
      <div className="er-container ob-inner">
        <div className="ob-head">
          <p className="ob-eyebrow">Otel sahipleri için</p>
          <h2 id="ob-title" className="er-display ob-title">
            Otelinizi video turla tanıtın
          </h2>
          {hotels.length > 0 ? (
            <p className="ob-count">
              <strong>{hotels.length}</strong> otel Otelsayfam’da
            </p>
          ) : null}
        </div>
        <ol className="ob-steps">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <span className="ob-step-no">0{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
        <Link href="/dashboard" className="ob-cta">
          Otelinizi ekleyin <IconArrowRight size={16} aria-hidden />
        </Link>
      </div>
      {showStrips ? <Strip photos={bottom} reverse /> : null}
    </section>
  );
}

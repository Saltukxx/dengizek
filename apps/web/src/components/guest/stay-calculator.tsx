"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconAlertCircle, IconArrowRight, IconCalculator, IconCheck, IconInfoCircle, IconRosetteDiscount } from "@tabler/icons-react";
import { stayPayUpsell } from "@/lib/promotion-display";
import { formatPrice, todayIso } from "@/lib/price";
import {
  describeParty,
  parseStaySearch,
  quoteStay,
  stayQueryEntries,
  withStayQuery,
  type QuotePricing,
  type RoomQuote,
  type StaySearch,
} from "@/lib/stay-search";
import { StayFields } from "./stay-fields";

/** Fiyatı olmayan otelde listelenen uygun oda adı sayısı. */
const ROOM_NAME_PREVIEW = 6;

/** Hesaplayıcı seçimi değişince sayfadaki talep bağlantılarına haber verir. */
const STAY_EVENT = "konaklama:degisti";

function broadcast(stay: StaySearch) {
  // Paylaşılan bağlantı ve geri tuşu aynı seçimi açsın: URL sessizce güncellenir.
  const url = new URL(window.location.href);
  for (const key of ["giris", "cikis", "yetiskin", "cocuk"]) url.searchParams.delete(key);
  for (const [key, value] of stayQueryEntries(stay)) url.searchParams.set(key, value);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new CustomEvent<StaySearch>(STAY_EVENT, { detail: stay }));
}

/** Konaklama seçimini taşıyan bağlantı (talep formu tarihleri ve kişileri hazır açar). */
export function StayLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const params = useSearchParams();
  const [stay, setStay] = useState<StaySearch>(() => parseStaySearch(params));
  useEffect(() => {
    const onChange = (e: Event) => setStay((e as CustomEvent<StaySearch>).detail);
    window.addEventListener(STAY_EVENT, onChange);
    return () => window.removeEventListener(STAY_EVENT, onChange);
  }, []);
  return (
    <Link href={withStayQuery(href, stay)} className={className}>
      {children}
    </Link>
  );
}

export interface StayCalculatorProps {
  pricing: QuotePricing;
  /** Oda slug'ı → pansiyon tipi etiketi (sunucuda çözülür; şema istemciye inmesin). */
  boardLabels: Record<string, string>;
  inquiryPath: string;
  hotelSlug: string;
}

function RoomRow({ quote, nights, inquiryHref, boardLabel }: { quote: RoomQuote; nights: number; inquiryHref: string; boardLabel?: string }) {
  const perNight = quote.totalMinor != null ? Math.round(quote.totalMinor / nights) : null;
  return (
    <li className="sc-room" data-fit={quote.fit}>
      <div className="sc-room-main">
        <p className="sc-room-name">{quote.name}</p>
        <p className="sc-room-meta">
          {boardLabel ? <span>{boardLabel}</span> : null}
          {quote.fit === "fits" ? (
            <span className="sc-ok">
              <IconCheck size={14} aria-hidden /> Kişi sayısına uygun
            </span>
          ) : quote.fit === "confirm" ? (
            <span className="sc-warn">Çocuk kapasitesi otelden teyit edilir</span>
          ) : (
            <span className="sc-no">Bu kişi sayısı için küçük</span>
          )}
        </p>
        {quote.minStayShortfall ? (
          <p className="sc-note">
            <IconAlertCircle size={14} aria-hidden /> Bu tarihlerde en az {quote.minStayShortfall} gece konaklama gerekiyor.
          </p>
        ) : null}
      </div>
      <div className="sc-room-price">
        {quote.unavailable ? (
          <>
            <strong className="sc-request">{quote.unavailable}</strong>
            <small>Başka tarih seçin ya da otele sorun</small>
          </>
        ) : quote.totalMinor != null ? (
          <>
            {quote.originalTotalMinor != null && <s>{formatPrice(quote.originalTotalMinor, quote.currency)}</s>}
            <strong>{formatPrice(quote.totalMinor, quote.currency)}</strong>
            <small>
              {nights} gece{quote.freeNights ? ` (${quote.freeNights} gecesi ücretsiz)` : ""} · ort.{" "}
              {formatPrice(perNight, quote.currency)} / gece
            </small>
            {quote.discountLabel ? <span className="sc-badge">Kampanya: {quote.discountLabel}</span> : null}
            {quote.originalTotalMinor != null && quote.totalMinor != null && quote.originalTotalMinor > quote.totalMinor ? (
              <span className="sc-saving">{formatPrice(quote.originalTotalMinor - quote.totalMinor, quote.currency)} tasarruf</span>
            ) : null}
          </>
        ) : (
          <>
            <strong className="sc-request">Fiyat talep üzerine</strong>
            <small>Otel bu tarihler için fiyat verir</small>
          </>
        )}
        {quote.fit !== "no" && !quote.unavailable && (
          <Link href={inquiryHref} className="er-btn er-btn-cta sc-room-cta">
            {quote.totalMinor != null ? "Bu odayı iste" : "Fiyat iste"}
            <IconArrowRight size={15} aria-hidden />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Otel sayfası fiyat hesaplayıcısı — tarih ve kişi seçilince her odanın
 * toplam fiyatı sayfada, sunucuya gitmeden hesaplanır (oda kartlarıyla aynı
 * fiyat motoru: dönem, fiyat planı, kampanya ve çocuk yaşı dahil).
 */
export function StayCalculator({ pricing, boardLabels, inquiryPath, hotelSlug }: StayCalculatorProps) {
  const params = useSearchParams();
  const [stay, setStay] = useState<StaySearch>(() => parseStaySearch(params));
  const [today] = useState(() => todayIso());
  const quote = useMemo(() => (stay.checkIn ? quoteStay(pricing, stay, today) : null), [pricing, stay, today]);
  // Dışarıdan (ör. "1 gece daha kal") değişince tarih alanları yeniden kurulur.
  const [fieldsKey, setFieldsKey] = useState(0);
  const changeStay = (next: StaySearch) => {
    setStay(next);
    broadcast(next);
  };

  const inquiryFor = (roomSlug?: string) =>
    withStayQuery(`${inquiryPath}?hotel=${hotelSlug}${roomSlug ? `&room=${roomSlug}` : ""}`, { ...stay, hasParty: true });

  const visible = quote?.ok ? quote.rooms.filter((r) => r.fit !== "no") : [];
  const tooSmall = quote?.ok ? quote.rooms.length - visible.length : 0;
  const allOnRequest = quote?.ok && visible.length > 0 && visible.every((r) => r.totalMinor == null && !r.unavailable);
  // Kal-öde basamağına 1-2 gece kalan konaklamaya öneri.
  const upsell =
    quote?.ok && stay.checkIn && !allOnRequest
      ? stayPayUpsell(
          pricing.promotions,
          pricing.rooms.filter((r) => visible.some((v) => v.slug === r.slug && !v.unavailable)).map((r) => r.id),
          stay.checkIn,
          quote.nights,
          today,
        )
      : null;
  const upsellExtra = upsell?.extraNights ?? 0;
  const extendStay = () => {
    if (!stay.checkIn || !stay.checkOut || !upsellExtra) return;
    const out = new Date(`${stay.checkOut}T12:00:00.000Z`);
    out.setUTCDate(out.getUTCDate() + upsellExtra);
    changeStay({ ...stay, checkOut: out.toISOString().slice(0, 10) });
    setFieldsKey((k) => k + 1);
  };

  return (
    <section className="sc" aria-labelledby="sc-title">
      <div className="sc-head">
        <h2 id="sc-title" className="er-display sc-title">
          <IconCalculator size={22} stroke={1.7} aria-hidden /> Fiyat hesapla
        </h2>
        <p>Tarihinizi ve kişi sayınızı seçin; her oda için toplam fiyatı gösterelim.</p>
      </div>

      <StayFields key={fieldsKey} defaultValue={stay} onChange={changeStay} />

      <div className="sc-results" aria-live="polite">
        {!quote ? (
          <p className="sc-hint">
            <IconInfoCircle size={16} aria-hidden /> Giriş ve çıkış tarihi seçince oda oda toplam fiyat burada görünür.
          </p>
        ) : !quote.ok ? (
          <p className="sc-hint sc-hint-error">
            <IconAlertCircle size={16} aria-hidden /> {quote.error}
          </p>
        ) : visible.length === 0 ? (
          <div className="sc-empty">
            <p>Bu tesisin odaları {describeParty(stay)} için yeterli görünmüyor. Otel birden fazla oda ya da ek yatak önerebilir.</p>
            <Link href={inquiryFor()} className="er-btn er-btn-cta">
              Otele sorun <IconArrowRight size={15} aria-hidden />
            </Link>
          </div>
        ) : (
          <>
            {allOnRequest ? (
              // Hiçbir odada yayında fiyat yok: oda başına tekrar eden "talep
              // üzerine" kutuları yerine uygun odalar ve tek bir talep düğmesi.
              <div className="sc-request-all">
                <p className="sc-hint">
                  <IconInfoCircle size={16} aria-hidden /> Bu otel fiyatı talep üzerine veriyor. Talebiniz{" "}
                  {quote.nights} gece, {describeParty(stay)} bilgisiyle gider; otel size fiyatla döner.
                </p>
                <ul className="sc-room-names">
                  {visible.slice(0, ROOM_NAME_PREVIEW).map((room) => (
                    <li key={room.slug}>
                      <IconCheck size={15} aria-hidden />
                      <span>
                        {room.name}
                        {boardLabels[room.slug] ? <small> · {boardLabels[room.slug]}</small> : null}
                        {room.fit === "confirm" ? <small className="sc-warn"> · çocuk kapasitesi teyit edilir</small> : null}
                      </span>
                    </li>
                  ))}
                  {visible.length > ROOM_NAME_PREVIEW && (
                    <li className="sc-room-more">+{visible.length - ROOM_NAME_PREVIEW} oda daha uygun</li>
                  )}
                </ul>
                <Link href={inquiryFor()} className="er-btn er-btn-cta">
                  Bu tarihler için fiyat iste <IconArrowRight size={15} aria-hidden />
                </Link>
              </div>
            ) : null}
            <ul className="sc-rooms" hidden={allOnRequest || undefined}>
              {visible.map((room) => (
                <RoomRow
                  key={room.slug}
                  quote={room}
                  nights={quote.nights}
                  inquiryHref={inquiryFor(room.slug)}
                  boardLabel={boardLabels[room.slug]}
                />
              ))}
            </ul>
            {upsell && (
              <p className="sc-upsell">
                <IconRosetteDiscount size={16} aria-hidden />
                <span>{upsell.text}</span>
                <button type="button" onClick={extendStay}>
                  Tarihi uzat
                </button>
              </p>
            )}
            {tooSmall > 0 && (
              <p className="sc-foot">
                {tooSmall} oda {describeParty(stay)} için küçük olduğundan listelenmedi.
              </p>
            )}
            <p className="sc-foot">Şu anda ücret alınmaz. Fiyatı ve müsaitliği otel talebinize cevap verirken teyit eder.</p>
          </>
        )}
      </div>
    </section>
  );
}

/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  IconBed,
  IconBuildingCastle,
  IconHome,
  IconLeaf,
  IconMenu2,
  IconSoup,
  IconUserCircle,
  IconView360,
} from "@tabler/icons-react";
import { getPublishedHotelBySlug, getPublishedHotelContent } from "@/lib/hotels-repo";
import { AmenitiesSection } from "@/components/guest/amenities-section";
import { AvailabilitySection } from "@/components/guest/availability-section";
import { ExtrasSection } from "@/components/guest/extras-section";
import { GallerySection } from "@/components/guest/gallery-section";
import { HotelMapSection } from "@/components/guest/hotel-map-section";
import { PoliciesSection } from "@/components/guest/policies-section";
import { RestaurantsSection } from "@/components/guest/restaurants-section";
import { RoomsSection } from "@/components/guest/rooms-section";

type PageProps = { params: Promise<{ slug: string }> };

const heroImage =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBbCgeR0p5johbDZqyFqrDnWnBsbxmfvtg7US_-TmrugxW99qf_ZyIKqBsCgUe5rIkfcvMS-11rzhGwTDmQ9D_2fWljixHY3HyOD34I-GpnNnxYwChIE-m35MBlmAWygXPP3tf35GfJNHvd-MRf2UItw2Xv6scAVlZDsF52udPHunxQmUIe3xnNbm1LAExLUnBbIM9XqJrAiiezIwuQX7i162wWYw06w5A-BpqFIsAPoSxbcsGDDpBrBSt0UwsT5qudtF26KuObMc0";

const roomImages = {
  signature:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBGndoHp4lrs1jWBWZM5p0jwpjoHUD6bPtg4QidaZLvXhuGRgyTDP1gueQ25UAS1-bl5j-rU7PaNF28uJedCsIvCOk3nx7d-G2mweOsm-EruHcpKHPtePfwPr1Ax07AMAp8IlVRSSoooJvRunpfsxjGTmFGNbH0CiAWjHXCIlC_UQxlq6O7gdvRjW39SAFfWghyoI79k_WDueJowKA1bIZfpinQGc6x-TVRuJfOa8X8Oa2zNwz09Pi0ZuGM2GyQ_WoS-HBAfl0TlR8",
  bath:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuAnpjBU9H1xFuLKm1xQ4TjsK2W3P0pmdrys-JYbK51VkvavPjMBChqzxhzV0IQoDC5JHqDBKka2p26PwsCBr8dE7ASzDKzN01NLx0VVlMB8Dns5w5FjXxDag1Iyqq0OSh-N58yygvRdaAaQif-GjcSM3jY-uRp8Z_0zyixNDGNleY2ZYeYY-wR9B-bYCyhvPjiMJHwH8hjEjDIaociz7ZwZHQe4LmoCdqE9vDbFZWv5RjxO5qc_39oewxUyejzEqVzn_xAaIhMoHjo",
  lounge:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCucM24PIBQh43xpVAqjkEoNZoCUZIoOhcaXKbFDRCPTvtDeNyURycB9rOcKUZW7Aick189MuZYHKRbRaMsSV1XnDitzoXbVmZYVbTWzmPt_Is8nHJd41vjkDBbMx9w4ya5yiLh0vRxCg2rlps4_vPxAwep8ffX7NG9K1WHR_by6nRaAZ10ayO16dCtkGFlepI4NwDA8mdz-qFN9qdyenEt9_iLwpzUUNIFaWdBVOL0MIW1p41pX3qacM0zqzfN6SiL15Hw6FTJ_PA",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) return { title: "Otel" };
  return {
    title: hotel.name,
    description: hotel.shortDescription,
  };
}

export default async function HotelPage({ params }: PageProps) {
  const { slug } = await params;
  const hotel = await getPublishedHotelBySlug(slug);
  if (!hotel) notFound();

  // Panelde tanımlanan içerik (DB yoksa boş döner — mock akışı bozulmaz)
  const content = await getPublishedHotelContent(slug);

  if (slug !== "aurelia-bay") {
    return (
      <main className="luxury-full-bleed" style={{ padding: "96px 32px", minHeight: "100dvh" }}>
        <section style={{ maxWidth: 960, margin: "0 auto" }}>
          <Link href="/browse" className="luxury-label" style={{ color: "var(--lux-gold)", textDecoration: "none" }}>
            Koleksiyona dön
          </Link>
          <div className="luxury-glass" style={{ marginTop: 28, padding: 32, borderRadius: 8 }}>
            <p className="luxury-label" style={{ margin: 0 }}>
              {hotel.city}, {hotel.country}
            </p>
            <h1 className="luxury-sans-title" style={{ fontSize: 54, margin: "18px 0 14px" }}>
              {hotel.name}
            </h1>
            <p style={{ maxWidth: 680, color: "var(--lux-muted)", fontSize: 18, lineHeight: 1.7 }}>
              {hotel.longDescription}
            </p>
          </div>
        </section>
        <RoomsSection
          hotelSlug={slug}
          rooms={content.rooms}
          promotions={content.promotions}
          ratePlanPrices={content.ratePlanPrices}
        />
        <GallerySection images={content.gallery} />
        <HotelMapSection
          latitude={content.latitude}
          longitude={content.longitude}
          address={content.specs.address}
          hotelName={hotel.name}
        />
        <AvailabilitySection
          hotelSlug={slug}
          notes={content.availabilityNotes}
          blackoutText={content.specs.blackoutText}
        />
        <AmenitiesSection amenities={content.amenities} specs={content.specs} />
        <RestaurantsSection restaurants={content.restaurants} />
        <ExtrasSection extras={content.extras} />
        <PoliciesSection specs={content.specs} />
      </main>
    );
  }

  return (
    <main className="luxury-full-bleed">
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 70,
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 28px",
          background: "rgba(15, 23, 42, 0.66)",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(28px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <IconMenu2 size={22} color="var(--lux-dim)" />
          <Link
            href="/hotels/aurelia-bay"
            style={{
              color: "var(--lux-gold)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-0.04em",
              textDecoration: "none",
            }}
          >
            AURELIA
          </Link>
        </div>
        <nav
          style={{
            display: "flex",
            gap: 34,
            alignItems: "center",
          }}
          className="luxury-home-nav"
          aria-label="Aurelia Bay navigation"
        >
          {["Aurelia Bay Resort", "Odalarımız", "Gastronomi", "Spa & Wellness"].map((item, i) => (
            <a
              key={item}
              href={i === 0 ? "#top" : i === 1 ? "#odalar" : "#deneyimler"}
              className="luxury-label"
              style={{
                color: i === 0 ? "var(--lux-gold)" : "rgba(208,197,178,0.76)",
                textDecoration: "none",
                fontSize: 13,
              }}
            >
              {item}
            </a>
          ))}
        </nav>
        <div
          aria-hidden
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            border: "1px solid rgba(212,175,55,0.45)",
            background: "rgba(0,0,0,0.35)",
            color: "var(--lux-gold)",
          }}
        >
          <IconUserCircle size={20} />
        </div>
      </header>

      <section
        id="top"
        className="luxury-grain"
        style={{
          position: "relative",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          textAlign: "center",
          padding: "96px 24px 120px",
        }}
      >
        <img
          src={heroImage}
          alt="Aurelia Bay Resort coastline at twilight"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.58,
            filter: "grayscale(1) contrast(1.08) brightness(0.72)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, var(--lux-bg) 0%, rgba(11,15,18,0.7) 28%, rgba(11,15,18,0.18) 66%, rgba(11,15,18,0.55) 100%)",
          }}
        />
        <div style={{ position: "relative", zIndex: 2, maxWidth: 880 }}>
          <div
            className="luxury-label"
            style={{
              display: "inline-flex",
              border: "1px solid rgba(212,175,55,0.42)",
              borderRadius: 999,
              padding: "7px 16px",
              background: "rgba(0,0,0,0.18)",
              marginBottom: 34,
            }}
          >
            Gecenin Zarafeti
          </div>
          <h1
            className="luxury-sans-title"
            style={{
              margin: 0,
              fontSize: "clamp(48px, 7vw, 82px)",
              lineHeight: 1.06,
              color: "var(--lux-text)",
              textShadow: "0 2px 20px rgba(0,0,0,0.55)",
            }}
          >
            Aurelia Bay Resort
          </h1>
          <p
            style={{
              margin: "28px auto 0",
              maxWidth: 700,
              color: "var(--lux-muted)",
              fontSize: "clamp(16px, 1.6vw, 20px)",
              lineHeight: 1.7,
            }}
          >
            Zamanın durduğu, doğanın ve lüksün kusursuz bir uyum içinde dans ettiği o saklı koya hoş geldiniz.
          </p>
          <Link
            href="/tours/aurelia-bay/demo-lobby"
            className="luxury-gold-button"
            style={{ marginTop: 52 }}
          >
            <IconView360 size={20} />
            Sanal Turu Deneyimle
          </Link>
        </div>
      </section>

      {content.rooms.length > 0 ? (
        <RoomsSection
          hotelSlug={slug}
          rooms={content.rooms}
          promotions={content.promotions}
          ratePlanPrices={content.ratePlanPrices}
        />
      ) : (
      <section
        id="odalar"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "64px 32px 96px",
        }}
      >
        <div style={{ marginBottom: 42 }}>
          <h2
            className="luxury-sans-title"
            style={{ margin: 0, fontSize: "clamp(42px, 5vw, 64px)", lineHeight: 1.08 }}
          >
            Odalarımız
          </h2>
          <div style={{ width: 50, height: 4, background: "var(--lux-gold)", marginTop: 16 }} />
        </div>

        <div className="aurelia-room-grid">
          <Link href="/hotels/aurelia-bay/rooms/seaview-deluxe" className="aurelia-room-card large">
            <img src={roomImages.signature} alt="Signature Villa bedroom" />
            <span className="room-overlay" />
            <span className="room-copy">
              <strong>Signature Villa</strong>
              <small><IconBed size={16} /> Özel Havuzlu Lüks</small>
            </span>
          </Link>
          <Link href="/hotels/aurelia-bay/rooms/courtyard-quiet" className="aurelia-room-card icon">
            <IconBuildingCastle size={54} />
            <strong>Kral Dairesi</strong>
            <small>Detayları İncele</small>
          </Link>
          <Link href="/hotels/aurelia-bay/rooms/seaview-deluxe" className="aurelia-room-card half">
            <img src={roomImages.bath} alt="Ocean view suite bathroom" />
            <span className="room-overlay" />
            <span className="room-copy">
              <strong>Okyanus Manzaralı Süit</strong>
            </span>
          </Link>
          <Link href="/hotels/aurelia-bay/rooms/courtyard-quiet" className="aurelia-room-card half">
            <img src={roomImages.lounge} alt="Premium room lounge" />
            <span className="room-overlay" />
            <span className="room-copy">
              <strong>Premium Odalar</strong>
            </span>
          </Link>
        </div>
      </section>
      )}

      <div id="deneyimler">
        <HotelMapSection
          latitude={content.latitude}
          longitude={content.longitude}
          address={content.specs.address}
          hotelName={hotel.name}
        />
        <AvailabilitySection
          hotelSlug={slug}
          notes={content.availabilityNotes}
          blackoutText={content.specs.blackoutText}
        />
        <AmenitiesSection amenities={content.amenities} specs={content.specs} />
        <RestaurantsSection restaurants={content.restaurants} />
        <ExtrasSection extras={content.extras} />
        <PoliciesSection specs={content.specs} />
      </div>

      <nav className="luxury-mobile-bottom-nav" aria-label="Mobile Aurelia navigation">
        {[
          ["Home", IconHome],
          ["Tours", IconView360],
          ["Gastronomi", IconSoup],
          ["Spa", IconLeaf],
          ["Profile", IconUserCircle],
        ].map(([label, Icon], index) => (
          <Link
            key={String(label)}
            href={index === 1 ? "/tours/aurelia-bay/demo-lobby" : "#top"}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              color: index === 0 ? "var(--lux-gold)" : "rgba(138,155,176,0.82)",
              fontSize: 10,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            <Icon size={22} />
            {String(label)}
          </Link>
        ))}
      </nav>
    </main>
  );
}

interface HotelMapSectionProps {
  latitude: string | null;
  longitude: string | null;
  address?: string | null;
  hotelName: string;
}

export function HotelMapSection({ latitude, longitude, address, hotelName }: HotelMapSectionProps) {
  const lat = latitude?.trim();
  const lng = longitude?.trim();
  if (!lat || !lng) return null;

  const latN = Number(lat);
  const lngN = Number(lng);
  if (Number.isNaN(latN) || Number.isNaN(lngN)) return null;

  const delta = 0.012;
  const bbox = [lngN - delta, latN - delta, lngN + delta, latN + delta].join(",");
  const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${latN}%2C${lngN}`;

  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 32px" }}>
      <h2
        className="luxury-sans-title"
        style={{ margin: "0 0 8px", fontSize: "clamp(28px, 3vw, 40px)" }}
      >
        Konum
      </h2>
      <div style={{ width: 48, height: 2, background: "var(--lux-gold)", marginBottom: 24 }} />
      {address && (
        <p style={{ margin: "0 0 16px", color: "var(--lux-muted)", fontSize: 15 }}>{address}</p>
      )}
      <iframe
        title={`${hotelName} harita`}
        src={embedUrl}
        style={{
          width: "100%",
          height: 320,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
        }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  );
}

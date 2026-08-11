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
    <section className="er-detail-section">
      <h2
        className="er-display"
        style={{ margin: "0 0 8px", fontSize: "clamp(28px, 3vw, 40px)" }}
      >
        Konum
      </h2>
      
      {address && (
        <p style={{ margin: "0 0 16px", color: "var(--er-text-muted)", fontSize: 15 }}>{address}</p>
      )}
      <iframe
        title={`${hotelName} harita`}
        src={embedUrl}
        style={{
          width: "100%",
          height: 320,
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "var(--er-radius-md)",
        }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </section>
  );
}

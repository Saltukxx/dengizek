/* eslint-disable @next/next/no-img-element */

interface GalleryImage {
  url: string;
  caption: string | null;
}

export function GallerySection({ images }: { images: GalleryImage[] }) {
  if (images.length === 0) return null;

  return (
    <section style={{ maxWidth: 960, margin: "48px auto", padding: "0 32px" }}>
      <h2 className="luxury-sans-title" style={{ fontSize: 28, marginBottom: 20 }}>
        Galeri
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
        }}
      >
        {images.map((img, i) => (
          <figure key={img.url + i} style={{ margin: 0 }}>
            <img
              src={img.url}
              alt={img.caption ?? `Galeri ${i + 1}`}
              style={{
                width: "100%",
                height: 180,
                objectFit: "cover",
                borderRadius: 8,
              }}
            />
            {img.caption && (
              <figcaption style={{ fontSize: 13, color: "var(--lux-muted)", marginTop: 6 }}>
                {img.caption}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}

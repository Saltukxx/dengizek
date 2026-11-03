/* eslint-disable @next/next/no-img-element */

interface GalleryImage {
  url: string;
  caption: string | null;
}

/** İlk bakışta gösterilen fotoğraf sayısı; kalanı açılır bölümde. */
const PREVIEW_COUNT = 8;

function Thumb({ img, index }: { img: GalleryImage; index: number }) {
  return (
    <img
      src={img.url}
      alt={img.caption ?? `Galeri ${index + 1}`}
      loading="lazy"
      className="er-gallery-thumb"
    />
  );
}

/**
 * Galeri — aktarılan tesislerde 70+ fotoğraf olabiliyor. İlk birkaçı görünür,
 * kalanı panelde girilen başlığa (Oda, Termal & Spa…) göre gruplanıp açılır.
 */
export function GallerySection({ images }: { images: GalleryImage[] }) {
  if (images.length === 0) return null;

  const preview = images.slice(0, PREVIEW_COUNT);
  const rest = images.slice(PREVIEW_COUNT);
  const groups = new Map<string, { img: GalleryImage; index: number }[]>();
  rest.forEach((img, i) => {
    const key = img.caption?.trim() || "Diğer";
    groups.set(key, [...(groups.get(key) ?? []), { img, index: PREVIEW_COUNT + i }]);
  });

  return (
    <section className="er-detail-section">
      <h2 className="er-display er-h2">Fotoğraflar</h2>
      <div className="er-gallery-grid">
        {preview.map((img, i) => (
          <Thumb key={img.url + i} img={img} index={i} />
        ))}
      </div>

      {rest.length > 0 && (
        <details className="er-gallery-more">
          <summary>Tüm fotoğrafları göster ({images.length})</summary>
          {[...groups].map(([caption, items]) => (
            <div key={caption}>
              <h3>
                {caption} <span>{items.length}</span>
              </h3>
              <div className="er-gallery-grid">
                {items.map(({ img, index }) => (
                  <Thumb key={img.url + index} img={img} index={index} />
                ))}
              </div>
            </div>
          ))}
        </details>
      )}
    </section>
  );
}

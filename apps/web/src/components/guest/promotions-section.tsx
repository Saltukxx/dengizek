import { IconClockHour4, IconRosetteDiscount } from "@tabler/icons-react";
import type { GuestPromotion } from "@/lib/guest-pricing";
import { groupedPromotionDisplays } from "@/lib/promotion-display";

/**
 * Otel sayfasındaki kampanya bölümü — fiyat hesaplayıcının hemen üstünde.
 * Her kampanya sade dille anlatılır: ne kazandırır, hangi tarihlerde,
 * kaç gece, son rezervasyon ve kontenjan. Kampanya yoksa hiç çıkmaz.
 */
export function PromotionsSection({
  promotions,
  roomNames,
  today,
}: {
  promotions: GuestPromotion[];
  roomNames: Record<string, string>;
  today: string;
}) {
  const cards = groupedPromotionDisplays(promotions, today, roomNames);
  if (!cards.length) return null;
  return (
    <section className="pr" aria-labelledby="pr-title">
      <h2 id="pr-title" className="pr-title">
        <IconRosetteDiscount size={20} stroke={1.8} aria-hidden />
        {cards.length === 1 ? "Bu otelde kampanya var" : `Bu otelde ${cards.length} kampanya var`}
      </h2>
      <ul className="pr-list">
        {cards.map((d, i) => {
          const dated = d.periods.filter((x) => x.label);
          return (
            <li key={`${d.name}-${i}`} className="pr-item">
              <p className="pr-headline">{d.headline}</p>
              <p className="pr-name">{d.name}</p>
              {d.conditions.length > 0 && (
                <ul className="pr-conditions">
                  {d.conditions.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              )}
              {dated.length > 0 && (
                <div className="pr-periods">
                  <p className="pr-periods-title">{dated.length === 1 ? "Konaklama dönemi" : "Konaklama dönemleri"}</p>
                  <ul>
                    {dated.map((x) => (
                      <li key={`${x.label}-${x.bookableTo}`}>
                        <span>{x.label}</span>
                        {x.bookableTo && (
                          <span className="pr-deadline">
                            <IconClockHour4 size={13} aria-hidden /> son rezervasyon {x.bookableTo}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {d.periods.some((x) => !x.label && x.bookableTo) && (
                <p className="pr-urgency">
                  <IconClockHour4 size={14} aria-hidden /> Son rezervasyon: {d.periods.find((x) => x.bookableTo)?.bookableTo}
                </p>
              )}
              {d.limited && <p className="pr-urgency">Kontenjanla sınırlı</p>}
            </li>
          );
        })}
      </ul>
      <p className="pr-foot">Kampanya, uygun tarih ve gece sayısı seçildiğinde aşağıdaki fiyata kendiliğinden uygulanır; kampanyalar birleştirilmez.</p>
    </section>
  );
}

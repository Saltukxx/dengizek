import SwiftUI

/// Otel kartı: 16:9 görsel + "Video tur" etiketi, başlık, şehir · yıldız,
/// öne çıkan olanaklar, fiyat. Uzun açıklama otel sayfasında; kartta iki
/// satırda kesilen metin karar için bilgi vermiyordu.
struct HotelCardView: View {
    @Environment(\.theme) private var theme
    let hotel: HotelCard

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay { RemoteImage(path: hotel.imageUrl) }
                .clipped()
                .overlay(alignment: .bottomLeading) { tourBadge }
                .overlay(alignment: .topTrailing) { SaveButton(hotel: hotel.summary).padding(10) }
                .overlay(alignment: .topLeading) { promotion }

            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 12) {
                    Text(hotel.name)
                        .font(theme.display(22, style: .title3))
                        .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let average = hotel.reviewAverage, hotel.reviewCount > 0 {
                        Text(Formatting.rating(average))
                            .font(theme.body(15, weight: 700))
                            .foregroundStyle(theme.primary)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(theme.primaryTint, in: .rect(cornerRadius: theme.radiusSmall))
                            .accessibilityLabel("Puan \(average, format: .number)")
                    }
                }
                if let meta = metaLine {
                    Text(meta).font(theme.body(15)).foregroundStyle(theme.textDim)
                }
                if !hotel.highlights.isEmpty {
                    Text(hotel.highlights.joined(separator: " · "))
                        .font(theme.body(14, weight: 600))
                        .foregroundStyle(theme.text)
                }
                price.padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 20)
        }
        .cardSurface()
        .accessibilityElement(children: .combine)
    }

    private var metaLine: String? {
        var parts: [String] = []
        if let city = hotel.city { parts.append(city) }
        if let stars = hotel.starRating, stars > 0 { parts.append(String(localized: "\(stars) yıldızlı")) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    @ViewBuilder private var tourBadge: some View {
        if hotel.tourId != nil {
            Label("Video tur", systemImage: "play.fill")
                .font(theme.body(14, weight: 600))
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Color(hex: 0x0E1F40, opacity: 0.82), in: .rect(cornerRadius: theme.radius))
                .padding(12)
        }
    }

    @ViewBuilder private var promotion: some View {
        if let badge = hotel.promotionBadge {
            Text(badge)
                .font(theme.body(13, weight: 700))
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(theme.cta, in: .rect(cornerRadius: theme.radiusSmall))
                .padding(12)
        }
    }

    @ViewBuilder private var price: some View {
        if let price = hotel.price {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Formatting.price(price))
                    .font(theme.display(24, style: .title2))
                    .foregroundStyle(theme.primary)
                Text(price.fromDate == nil ? String(localized: "gecelik başlayan") : String(localized: "gecelik · \(Formatting.priceNote(price))"))
                    .font(theme.body(14))
                    .foregroundStyle(theme.textDim)
            }
        } else {
            Label("Fiyat talep üzerine", systemImage: "envelope")
                .font(theme.body(14, weight: 600))
                .foregroundStyle(theme.textMuted)
        }
    }
}

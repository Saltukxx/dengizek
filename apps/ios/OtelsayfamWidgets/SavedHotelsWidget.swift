import SwiftUI
import UIKit
import WidgetKit

/// Ana ekran widget'ı: kaydedilen oteller, kapak görseli ve gecelik başlayan fiyat.
/// Dokununca uygulamada otel sayfası açılır.
struct SavedHotelsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: WidgetSnapshot.kind, provider: SavedHotelsProvider()) { entry in
            SavedHotelsWidgetView(entry: entry)
                .containerBackground(for: .widget) { WidgetPalette.background }
        }
        .configurationDisplayName("Kaydettikleriniz")
        .description("Kaydettiğiniz oteller ve gecelik başlayan fiyatları.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct OtelsayfamWidgetBundle: WidgetBundle {
    var body: some Widget {
        SavedHotelsWidget()
    }
}

struct SavedHotelsEntry: TimelineEntry {
    struct Item: Identifiable {
        let hotel: WidgetSnapshot.Hotel
        let priceText: String?
        let image: UIImage?
        var id: String { hotel.slug }
    }

    let date: Date
    let items: [Item]

    static let placeholder = SavedHotelsEntry(date: .now, items: [
        Item(hotel: .init(slug: "ornek-1", name: "Termal Otel", city: "Afyonkarahisar"), priceText: "₺8.900", image: nil),
        Item(hotel: .init(slug: "ornek-2", name: "Kar Zirvesi", city: "Uludağ"), priceText: "₺12.400", image: nil),
    ])
}

struct SavedHotelsProvider: TimelineProvider {
    func placeholder(in context: Context) -> SavedHotelsEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (SavedHotelsEntry) -> Void) {
        // Widget galerisinde örnek; ana ekranda eldeki son bilgiler (ağ beklenmez).
        completion(context.isPreview ? .placeholder : Self.entry(prices: nil))
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<SavedHotelsEntry>) -> Void) {
        Task {
            let prices = await Self.refreshedPrices()
            let next = Date.now.addingTimeInterval(6 * 60 * 60)
            completion(Timeline(entries: [Self.entry(prices: prices)], policy: .after(next)))
        }
    }

    /// Ortak klasördeki özetten giriş üretir; `prices` nil ise son kayıtlı fiyatlar.
    private static func entry(prices: WidgetPrices?) -> SavedHotelsEntry {
        guard let directory = SharedContainer.url, let snapshot = WidgetSnapshot.load(from: directory) else {
            return SavedHotelsEntry(date: .now, items: [])
        }
        let known = prices ?? WidgetPrices.load(from: directory)
        let items = snapshot.hotels.prefix(WidgetSnapshot.visibleLimit).map { hotel in
            SavedHotelsEntry.Item(
                hotel: hotel,
                priceText: known.bySlug[hotel.slug]?.text,
                image: UIImage(contentsOfFile: WidgetSnapshot.imageFile(slug: hotel.slug, in: directory).path())
            )
        }
        return SavedHotelsEntry(date: .now, items: Array(items))
    }

    /// Güncel fiyatları sunucudan alıp kaydeder; ulaşılamazsa nil (son kayıt kullanılır).
    private static func refreshedPrices() async -> WidgetPrices? {
        guard let directory = SharedContainer.url, let snapshot = WidgetSnapshot.load(from: directory), !snapshot.hotels.isEmpty else {
            return nil
        }
        var request = URLRequest(url: snapshot.apiBaseURL.appending(path: "api/v1/hotels"))
        request.timeoutInterval = 10
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let prices = try? WidgetPrices(listResponse: data) else { return nil }
        prices.save(to: directory)
        return prices
    }
}

/// Uygulamanın termal temasıyla aynı renkler (widget'ta tema seçimi yok).
enum WidgetPalette {
    static let background = Color(red: 0.965, green: 0.949, blue: 0.918)
    static let ink = Color(red: 0.055, green: 0.122, blue: 0.251)
    static let primary = Color(red: 0.106, green: 0.369, blue: 0.345)
    static let dim = Color(red: 0.36, green: 0.38, blue: 0.40)
    static let placeholder = Color(red: 0.86, green: 0.84, blue: 0.80)
}

struct SavedHotelsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SavedHotelsEntry

    var body: some View {
        if entry.items.isEmpty {
            empty
        } else if family == .systemSmall, let first = entry.items.first {
            SmallHotel(item: first)
                .widgetURL(first.hotel.deepLink)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(entry.items) { item in
                    Link(destination: item.hotel.deepLink) { HotelLine(item: item) }
                }
                Spacer(minLength: 0)
            }
        }
    }

    private var empty: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart")
                .font(.title2)
                .foregroundStyle(WidgetPalette.primary)
            Text("Otel kaydedin, burada görünsün.")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(WidgetPalette.ink)
                .multilineTextAlignment(.center)
        }
    }
}

/// Küçük boy: en son kaydedilen otelin görseli üstünde ad ve fiyat.
private struct SmallHotel: View {
    let item: SavedHotelsEntry.Item

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Thumbnail(image: item.image)
                .frame(maxWidth: .infinity)
                .frame(height: 70)
                .clipShape(.rect(cornerRadius: 10, style: .continuous))
            Text(item.hotel.name)
                .font(.system(.subheadline, design: .serif).weight(.semibold))
                .foregroundStyle(WidgetPalette.ink)
                .lineLimit(2)
                .minimumScaleFactor(0.85)
            Spacer(minLength: 0)
            PriceLine(item: item)
        }
    }
}

/// Orta boy satırı: küçük görsel, ad, şehir, fiyat.
private struct HotelLine: View {
    let item: SavedHotelsEntry.Item

    var body: some View {
        HStack(spacing: 10) {
            Thumbnail(image: item.image)
                .frame(width: 40, height: 40)
                .clipShape(.rect(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(item.hotel.name)
                    .font(.system(.subheadline, design: .serif).weight(.semibold))
                    .foregroundStyle(WidgetPalette.ink)
                    .lineLimit(1)
                if let city = item.hotel.city {
                    Text(city)
                        .font(.caption2)
                        .foregroundStyle(WidgetPalette.dim)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            PriceLine(item: item)
        }
    }
}

private struct PriceLine: View {
    let item: SavedHotelsEntry.Item

    var body: some View {
        if let price = item.priceText {
            VStack(alignment: .trailing, spacing: 0) {
                Text(price)
                    .font(.system(.subheadline, design: .serif).weight(.bold))
                    .foregroundStyle(WidgetPalette.primary)
                Text("gecelik başlayan")
                    .font(.system(size: 9))
                    .foregroundStyle(WidgetPalette.dim)
            }
            .accessibilityElement(children: .combine)
        } else {
            Text("Fiyat talep üzerine")
                .font(.caption2)
                .foregroundStyle(WidgetPalette.dim)
        }
    }
}

private struct Thumbnail: View {
    let image: UIImage?

    var body: some View {
        if let image {
            Color.clear.overlay {
                Image(uiImage: image)
                    .resizable()
                    .widgetAccentedRenderingMode(.fullColor)
                    .scaledToFill()
            }
            .clipped()
            .accessibilityHidden(true)
        } else {
            WidgetPalette.placeholder
                .overlay { Image(systemName: "building.2").foregroundStyle(WidgetPalette.dim) }
                .accessibilityHidden(true)
        }
    }
}

#Preview("Küçük", as: .systemSmall) {
    SavedHotelsWidget()
} timeline: {
    SavedHotelsEntry.placeholder
    SavedHotelsEntry(date: .now, items: [])
}

#Preview("Orta", as: .systemMedium) {
    SavedHotelsWidget()
} timeline: {
    SavedHotelsEntry.placeholder
}

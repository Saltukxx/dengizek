import SwiftData
import SwiftUI

/// Kalp düğmesi: oteli kaydeder ya da kayıttan çıkarır.
struct SaveButton: View {
    @Environment(\.modelContext) private var context
    @Environment(\.api) private var api
    @Query private var matches: [SavedHotel]
    let hotel: HotelSummary
    var style: Style = .overlay

    enum Style { case overlay, toolbar }

    init(hotel: HotelSummary, style: Style = .overlay) {
        self.hotel = hotel
        self.style = style
        let slug = hotel.slug
        _matches = Query(filter: #Predicate<SavedHotel> { $0.slug == slug })
    }

    private var isSaved: Bool { !matches.isEmpty }

    var body: some View {
        Button(isSaved ? String(localized: "Kayıttan çıkar") : String(localized: "Kaydet"), systemImage: isSaved ? "heart.fill" : "heart") {
            let willBeSaved = !isSaved
            withAnimation(.snappy) { HotelLibrary.toggleSaved(hotel, in: context) }
            Task { await PriceAlerts.shared.hotelChanged(slug: hotel.slug, saved: willBeSaved, api: api) }
        }
        .labelStyle(.iconOnly)
        .symbolEffect(.bounce, value: isSaved)
        .foregroundStyle(isSaved ? .red : (style == .overlay ? .white : .primary))
        .modifier(OverlayBackground(enabled: style == .overlay))
        .sensoryFeedback(.selection, trigger: isSaved)
    }

    private struct OverlayBackground: ViewModifier {
        let enabled: Bool
        func body(content: Content) -> some View {
            if enabled {
                content
                    .font(.title3)
                    .padding(10)
                    .background(.black.opacity(0.35), in: .circle)
            } else {
                content
            }
        }
    }
}

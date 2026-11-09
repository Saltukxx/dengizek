import SwiftData
import SwiftUI

/// Kalp düğmesi: oteli kaydeder ya da kayıttan çıkarır.
struct SaveButton: View {
    @Environment(\.modelContext) private var context
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
        Button(isSaved ? "Kayıttan çıkar" : "Kaydet", systemImage: isSaved ? "heart.fill" : "heart") {
            withAnimation(.snappy) { HotelLibrary.toggleSaved(hotel, in: context) }
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

import SwiftData
import SwiftUI

struct SavedView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.theme) private var theme
    @Query(sort: \SavedHotel.savedAt, order: .reverse) private var saved: [SavedHotel]
    @Query(sort: \RecentHotel.viewedAt, order: .reverse) private var recent: [RecentHotel]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if saved.isEmpty && recent.isEmpty {
                    ContentUnavailableView("Henüz kayıt yok", systemImage: "heart", description: Text("Beğendiğiniz otellerde ♡ simgesine dokunun; burada toplanır."))
                        .padding(.top, 60)
                }
                if !saved.isEmpty {
                    Eyebrow("Kaydedilenler · \(saved.count)")
                    ForEach(saved) { hotel in
                        let summary = HotelSummary(slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl)
                        NavigationLink(value: summary) { HotelRow(summary: summary) }
                            .buttonStyle(.plain)
                            .contextMenu {
                                Button("Kayıttan çıkar", systemImage: "heart.slash", role: .destructive) {
                                    context.delete(hotel)
                                    try? context.save()
                                }
                            }
                    }
                }
                if !recent.isEmpty {
                    Eyebrow("Son baktıklarınız").padding(.top, saved.isEmpty ? 0 : 16)
                    ForEach(recent.prefix(10)) { hotel in
                        let summary = HotelSummary(slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl)
                        NavigationLink(value: summary) { HotelRow(summary: summary) }
                            .buttonStyle(.plain)
                    }
                }
            }
            .padding(16)
        }
        .background(theme.bg)
        .navigationTitle("Kaydedilenler")
        .navigationDestination(for: HotelSummary.self) { hotel in
            HotelDetailView(slug: hotel.slug, title: hotel.name)
        }
    }
}

#Preview {
    NavigationStack { SavedView() }
        .modelContainer(for: [SavedHotel.self, RecentHotel.self], inMemory: true)
}

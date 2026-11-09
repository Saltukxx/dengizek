import Foundation
import SwiftData
import Testing
@testable import Otelsayfam

@MainActor
struct HotelLibraryTests {
    let context: ModelContext

    init() throws {
        let container = try ModelContainer(for: SavedHotel.self, RecentHotel.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        context = ModelContext(container)
    }

    private func hotel(_ slug: String) -> HotelSummary {
        HotelSummary(slug: slug, name: slug.capitalized, city: "Afyon", imageUrl: nil)
    }

    @Test func toggleSavesThenRemoves() {
        HotelLibrary.toggleSaved(hotel("oruc"), in: context)
        #expect(HotelLibrary.isSaved("oruc", in: context))
        HotelLibrary.toggleSaved(hotel("oruc"), in: context)
        #expect(!HotelLibrary.isSaved("oruc", in: context))
    }

    @Test func recentViewsAreUniqueAndCapped() throws {
        for i in 0..<(HotelLibrary.recentLimit + 5) { HotelLibrary.recordView(hotel("otel-\(i)"), in: context) }
        HotelLibrary.recordView(hotel("otel-0"), in: context)
        let recent = try context.fetch(FetchDescriptor<RecentHotel>(sortBy: [SortDescriptor(\.viewedAt, order: .reverse)]))
        #expect(recent.count == HotelLibrary.recentLimit)
        #expect(recent.first?.slug == "otel-0")
        #expect(Set(recent.map(\.slug)).count == recent.count)
    }
}

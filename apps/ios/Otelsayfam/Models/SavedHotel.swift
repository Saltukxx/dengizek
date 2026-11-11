import Foundation
import SwiftData

/// Misafirin kaydettiği otel — yalnız cihazda tutulur, hesap gerekmez.
@Model
final class SavedHotel {
    @Attribute(.unique) var slug: String
    var name: String
    var city: String?
    var imageUrl: String?
    var savedAt: Date

    init(slug: String, name: String, city: String?, imageUrl: String?, savedAt: Date = .now) {
        self.slug = slug
        self.name = name
        self.city = city
        self.imageUrl = imageUrl
        self.savedAt = savedAt
    }
}

/// Son bakılan oteller (en yeni üstte, sınırlı sayıda).
@Model
final class RecentHotel {
    @Attribute(.unique) var slug: String
    var name: String
    var city: String?
    var imageUrl: String?
    var viewedAt: Date

    init(slug: String, name: String, city: String?, imageUrl: String?, viewedAt: Date = .now) {
        self.slug = slug
        self.name = name
        self.city = city
        self.imageUrl = imageUrl
        self.viewedAt = viewedAt
    }
}

/// Kart, detay ve kayıt arasında taşınan otel özeti.
struct HotelSummary: Hashable, Sendable {
    let slug: String
    let name: String
    let city: String?
    let imageUrl: String?
}

extension HotelCard {
    var summary: HotelSummary { HotelSummary(slug: slug, name: name, city: city, imageUrl: imageUrl) }
}

extension HotelDetail {
    var summary: HotelSummary { HotelSummary(slug: slug, name: name, city: city, imageUrl: imageUrl) }
}

@MainActor
enum HotelLibrary {
    static let recentLimit = 20

    static func isSaved(_ slug: String, in context: ModelContext) -> Bool {
        let descriptor = FetchDescriptor<SavedHotel>(predicate: #Predicate { $0.slug == slug })
        return ((try? context.fetchCount(descriptor)) ?? 0) > 0
    }

    static func toggleSaved(_ hotel: HotelSummary, in context: ModelContext) {
        let slug = hotel.slug
        let descriptor = FetchDescriptor<SavedHotel>(predicate: #Predicate { $0.slug == slug })
        if let existing = try? context.fetch(descriptor).first {
            context.delete(existing)
        } else {
            context.insert(SavedHotel(slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl))
        }
        try? context.save()
        publish(in: context)
    }

    /// Kaydedilen otellerin kısa adları (fiyat bildirimi kayıtları için).
    static func savedSlugs(in context: ModelContext) -> [String] {
        ((try? context.fetch(FetchDescriptor<SavedHotel>())) ?? []).map(\.slug)
    }

    /// Uygulama dışındaki yüzeyleri günceller: iPhone araması (kaydedilenler ve
    /// son bakılanlar) ve ana ekran widget'ı (kaydedilenler, en yeni üstte).
    static func publish(in context: ModelContext) {
        guard SpotlightIndex.isEnabled || WidgetSync.isEnabled else { return }
        let saved = ((try? context.fetch(FetchDescriptor<SavedHotel>(sortBy: [SortDescriptor(\.savedAt, order: .reverse)]))) ?? [])
            .map { HotelSummary(slug: $0.slug, name: $0.name, city: $0.city, imageUrl: $0.imageUrl) }
        let recent = ((try? context.fetch(FetchDescriptor<RecentHotel>())) ?? [])
            .map { HotelSummary(slug: $0.slug, name: $0.name, city: $0.city, imageUrl: $0.imageUrl) }
        var seen = Set<String>()
        SpotlightIndex.replace(with: (saved + recent).filter { seen.insert($0.slug).inserted })
        WidgetSync.update(with: saved)
    }

    static func recordView(_ hotel: HotelSummary, in context: ModelContext) {
        let slug = hotel.slug
        let descriptor = FetchDescriptor<RecentHotel>(predicate: #Predicate { $0.slug == slug })
        if let existing = try? context.fetch(descriptor).first {
            existing.viewedAt = .now
            existing.name = hotel.name
            existing.imageUrl = hotel.imageUrl
        } else {
            context.insert(RecentHotel(slug: hotel.slug, name: hotel.name, city: hotel.city, imageUrl: hotel.imageUrl))
        }
        // Sınırlama sorgusu kaydedilmemiş yeni kaydı görmez: önce kaydet, sonra eskileri at.
        try? context.save()
        let all = (try? context.fetch(FetchDescriptor<RecentHotel>(sortBy: [SortDescriptor(\.viewedAt, order: .reverse)]))) ?? []
        for old in all.dropFirst(recentLimit) { context.delete(old) }
        try? context.save()
        publish(in: context)
    }
}

import CoreSpotlight
import Foundation

/// Kaydedilen ve son bakılan oteller iPhone aramasında (Spotlight) çıkar;
/// sonuca dokununca otel sayfası açılır.
enum SpotlightIndex {
    private static let domain = "hotels"
    private static let prefix = "hotel/"

    /// Testlerde (birim testi ve temiz açılışlı arayüz testi) gerçek dizine yazılmaz.
    static let isEnabled = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil && !DebugLaunch.resetsState

    static func identifier(slug: String) -> String { prefix + slug }

    static func slug(fromIdentifier identifier: String) -> String? {
        guard identifier.hasPrefix(prefix) else { return nil }
        let slug = String(identifier.dropFirst(prefix.count))
        return slug.isEmpty ? nil : slug
    }

    /// Arama sonucundan gelen etkinlik hangi oteli gösteriyor?
    static func slug(from activity: NSUserActivity) -> String? {
        guard activity.activityType == CSSearchableItemActionType,
              let identifier = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String else { return nil }
        return slug(fromIdentifier: identifier)
    }

    /// Dizini verilen otellerle değiştirir (liste küçük: kaydedilenler + son bakılanlar).
    static func replace(with hotels: [HotelSummary]) {
        guard isEnabled, CSSearchableIndex.isIndexingAvailable() else { return }
        Task.detached(priority: .utility) {
            let items = hotels.map { hotel in
                let attributes = CSSearchableItemAttributeSet(contentType: .content)
                attributes.title = hotel.name
                attributes.contentDescription = hotel.city.map { "\($0) · Otelsayfam" } ?? "Otelsayfam"
                attributes.keywords = [hotel.name, hotel.city, "otel"].compactMap(\.self)
                return CSSearchableItem(uniqueIdentifier: identifier(slug: hotel.slug), domainIdentifier: domain, attributeSet: attributes)
            }
            let index = CSSearchableIndex.default()
            try? await index.deleteSearchableItems(withDomainIdentifiers: [domain])
            try? await index.indexSearchableItems(items)
        }
    }
}

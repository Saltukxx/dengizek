import Observation
import SwiftUI

/// Sekme ve Keşfet gezinme yığını. Derin bağlantı (paylaşılan otel adresi,
/// `otelsayfam://`, bildirim) buradan otel sayfasını açar.
@MainActor
@Observable
final class Router {
    enum Tab: Hashable, Sendable { case explore, search, saved }

    var tab: Tab = .explore
    var explorePath = NavigationPath()

    /// Bağlantı bir oteli gösteriyorsa Keşfet'te o otelin sayfasını açar.
    @discardableResult
    func open(_ url: URL) -> Bool {
        guard let slug = DeepLink.hotelSlug(from: url) else { return false }
        openHotel(slug: slug)
        return true
    }

    func openHotel(slug: String) {
        tab = .explore
        explorePath = NavigationPath([HotelSummary(slug: slug, name: "", city: nil, imageUrl: nil)])
    }
}

enum DeepLink {
    static let scheme = "otelsayfam"

    /// `otelsayfam://hotel/{slug}` ya da web adresi `…/hotels/{slug}[/…]`.
    static func hotelSlug(from url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        let slug: String?
        switch url.scheme?.lowercased() {
        case scheme:
            slug = url.host() == "hotel" ? parts.first : nil
        case "http", "https":
            slug = parts.first == "hotels" && parts.count >= 2 ? parts[1] : nil
        default:
            slug = nil
        }
        guard let slug, slug.wholeMatch(of: /[a-z0-9][a-z0-9-]{0,99}/) != nil else { return nil }
        return slug
    }
}

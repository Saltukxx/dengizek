import Foundation

/// Konaklama araması: tarih ve kişi. Web'deki `giris`, `cikis`, `yetiskin`,
/// `cocuk` URL parametreleriyle aynı (apps/web/src/lib/stay-search.ts).
/// Keşfet'te seçilen değer otel ve oda sayfasına taşınır, talep formunu doldurur.
struct StaySearch: Equatable, Hashable, Sendable, Codable {
    static let maxAdults = 12
    static let maxChildren = 6
    static let maxChildAge = 17
    static let maxNights = 30

    var checkIn: Date?
    var checkOut: Date?
    var adults = 2
    var childAges: [Int] = []

    /// Tarihler ikisi birlikte ve sıralıysa geçerli.
    var hasDates: Bool {
        guard let checkIn, let checkOut else { return false }
        return checkOut > checkIn
    }

    /// Kişi bilgisi varsayılandan (2 yetişkin) farklı mı?
    var hasParty: Bool { adults != 2 || !childAges.isEmpty }

    var isEmpty: Bool { !hasDates && !hasParty }

    var nights: Int? {
        guard hasDates, let checkIn, let checkOut else { return nil }
        return Calendar.current.dateComponents([.day], from: checkIn, to: checkOut).day
    }

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if hasDates, let checkIn, let checkOut {
            items.append(URLQueryItem(name: "giris", value: Self.day(checkIn)))
            items.append(URLQueryItem(name: "cikis", value: Self.day(checkOut)))
        }
        // Varsayılan grup gönderilmez: web gibi kapasite süzgeci yalnız kişi seçilince çalışır.
        if hasParty { items.append(URLQueryItem(name: "yetiskin", value: String(adults))) }
        if !childAges.isEmpty {
            items.append(URLQueryItem(name: "cocuk", value: childAges.map(String.init).joined(separator: ",")))
        }
        return items
    }

    /// "24 – 27 Oca · 3 gece"; tarih yoksa nil.
    var datesSummary: String? {
        guard let checkIn, let checkOut, let nights else { return nil }
        let style = Date.FormatStyle.dateTime.day().month(.abbreviated)
        return String(localized: "\(checkIn.formatted(style)) – \(checkOut.formatted(style)) · \(nights) gece")
    }

    /// "2 yetişkin, 1 çocuk"
    var partySummary: String {
        // Yetişkin ve çocuk ayrı ayrı çoğullanır (Rusçada sayıya göre ek değişir).
        let adultsText = String(localized: "\(adults) yetişkin")
        return childAges.isEmpty ? adultsText : adultsText + ", " + String(localized: "\(childAges.count) çocuk")
    }

    /// Yeni tarih seçiminde önerilen başlangıç: bir hafta sonra, 2 gece.
    static func suggestedDates(now: Date = .now) -> (Date, Date) {
        let start = Calendar.current.date(byAdding: .day, value: 7, to: Calendar.current.startOfDay(for: now))!
        return (start, Calendar.current.date(byAdding: .day, value: 2, to: start)!)
    }

    static func day(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(timeZone: .current).year().month().day())
    }
}

/// Seçilen tarih ve kişi uygulama kapanınca kaybolmasın.
extension StaySearch {
    private static let storageKey = "ots.stay"

    /// Kayıtlı seçim. Giriş günü geçmişse tarihler atılır, kişi bilgisi kalır.
    static func restored(from defaults: UserDefaults, now: Date = .now) -> StaySearch {
        guard let data = defaults.data(forKey: storageKey), var stay = try? JSONDecoder().decode(StaySearch.self, from: data) else {
            return StaySearch()
        }
        if let checkIn = stay.checkIn, checkIn < Calendar.current.startOfDay(for: now) {
            stay.checkIn = nil
            stay.checkOut = nil
        }
        return stay
    }

    func save(to defaults: UserDefaults) {
        if isEmpty {
            defaults.removeObject(forKey: Self.storageKey)
        } else if let data = try? JSONEncoder().encode(self) {
            defaults.set(data, forKey: Self.storageKey)
        }
    }
}

/// Liste süzgeci — web vitrinindeki filtrelerin uygulamada verisi olanları.
struct BrowseFilters: Equatable, Hashable, Sendable {
    enum PriceBand: String, CaseIterable, Identifiable, Sendable {
        case budget, mid, luxury
        var id: String { rawValue }
        var title: String {
            switch self {
            case .budget: String(localized: "3.000 ₺ altı")
            case .mid: String(localized: "3.000–8.000 ₺")
            case .luxury: String(localized: "8.000 ₺ üstü")
            }
        }
    }

    enum Sort: String, CaseIterable, Identifiable, Sendable {
        case recommended, priceAsc = "price-asc"
        var id: String { rawValue }
        var title: String {
            switch self {
            case .recommended: String(localized: "Önerilen")
            case .priceAsc: String(localized: "En düşük fiyat")
            }
        }
    }

    var tourOnly = false
    var promoOnly = false
    var petsOnly = false
    var priceBand: PriceBand?
    var sort: Sort = .recommended

    /// Sıralama dışındaki seçili filtre sayısı.
    var activeCount: Int {
        [tourOnly, promoOnly, petsOnly, priceBand != nil].filter(\.self).count
    }

    var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if tourOnly { items.append(URLQueryItem(name: "tur", value: "1")) }
        if promoOnly { items.append(URLQueryItem(name: "kampanya", value: "1")) }
        if petsOnly { items.append(URLQueryItem(name: "pets", value: "1")) }
        if let priceBand { items.append(URLQueryItem(name: "price", value: priceBand.rawValue)) }
        if sort != .recommended { items.append(URLQueryItem(name: "sort", value: sort.rawValue)) }
        return items
    }
}

/// `/api/v1/hotels/{slug}/quote` yanıtı: seçilen tarih ve kişi için oda oda toplam.
struct StayQuote: Decodable, Hashable, Sendable {
    let checkIn: String
    let checkOut: String
    let nights: Int
    let adults: Int
    let childAges: [Int]
    let rooms: [RoomQuote]

    /// Bu grubu alan odalar (web hesaplayıcısı gibi almayanlar gösterilmez).
    var visibleRooms: [RoomQuote] { rooms.filter { $0.fit != .no } }

    /// Satılabilen en ucuz toplam.
    var cheapest: RoomQuote? {
        visibleRooms
            .filter { $0.isBookable && $0.totalMinor != nil }
            .min { ($0.totalMinor ?? .max) < ($1.totalMinor ?? .max) }
    }
}

struct RoomQuote: Decodable, Hashable, Sendable, Identifiable {
    enum Fit: String, Decodable, Sendable {
        /// Uygun · çocuk kapasitesi otelden teyit · bu grubu almaz.
        case fits, confirm, no
    }

    let slug: String
    let name: String
    let boardLabel: String?
    let fit: Fit
    let totalMinor: Int?
    let originalTotalMinor: Int?
    let currency: String
    let discountLabel: String?
    let freeNights: Int
    let unavailable: String?
    let minStayNights: Int?

    var id: String { slug }

    /// Satış kısıtı ve minimum konaklama engeli yok.
    var isBookable: Bool { unavailable == nil && minStayNights == nil }
}

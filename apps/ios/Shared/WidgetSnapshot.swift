import Foundation

/// Uygulama ile ana ekran widget'ının ortak klasörü (App Group). İmza
/// profilinde grup yetkisi yoksa `url` nil döner: widget boş durumunu gösterir.
enum SharedContainer {
    static let groupID = "group.com.gbsoft.otelsayfam"

    static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)
    }
}

/// Uygulamanın widget için yazdığı özet: kaydedilen oteller (en yeni üstte)
/// ve fiyatların sorulacağı sunucu adresi.
struct WidgetSnapshot: Codable, Equatable, Sendable {
    struct Hotel: Codable, Equatable, Sendable, Identifiable {
        let slug: String
        let name: String
        let city: String?
        var id: String { slug }

        /// Widget'a dokununca uygulamada açılacak otel sayfası.
        var deepLink: URL { URL(string: "otelsayfam://hotel/\(slug)")! }
    }

    static let kind = "SavedHotels"
    /// Widget'ta en çok bu kadar otel görünür; küçük görseller de bu kadarı için yazılır.
    static let visibleLimit = 3
    private static let fileName = "saved-hotels.json"

    var apiBaseURL: URL
    var hotels: [Hotel]

    static func load(from directory: URL) -> WidgetSnapshot? {
        guard let data = try? Data(contentsOf: directory.appending(path: fileName)) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    func save(to directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try JSONEncoder().encode(self).write(to: directory.appending(path: Self.fileName), options: .atomic)
    }

    /// Otelin küçültülmüş kapak görseli (widget ağdan görsel indirmez).
    static func imageFile(slug: String, in directory: URL) -> URL {
        directory.appending(path: "widget-\(slug).jpg")
    }
}

/// Widget'ın gösterdiği "gecelik başlayan" fiyatlar. Widget sunucudan tazeler;
/// ulaşamazsa son kaydı gösterir.
struct WidgetPrices: Codable, Equatable, Sendable {
    struct Amount: Codable, Equatable, Sendable {
        let amountMinor: Int
        let currency: String

        /// "₺8.900"
        var text: String {
            (Decimal(amountMinor) / 100).formatted(.currency(code: currency).presentation(.narrow).precision(.fractionLength(0)))
        }
    }

    private static let fileName = "widget-prices.json"

    var bySlug: [String: Amount] = [:]

    /// `/api/v1/hotels` yanıtından yalnız bugün geçerli fiyatlar alınır
    /// (ileri tarihli "X tarihinden itibaren" fiyatı widget'ta yanıltıcı olur).
    init(listResponse data: Data) throws {
        struct Response: Decodable {
            struct Hotel: Decodable {
                struct Price: Decodable {
                    let amountMinor: Int
                    let currency: String
                    let fromDate: String?
                }
                let slug: String
                let price: Price?
            }
            let hotels: [Hotel]
        }
        for hotel in try JSONDecoder().decode(Response.self, from: data).hotels {
            if let price = hotel.price, price.fromDate == nil {
                bySlug[hotel.slug] = Amount(amountMinor: price.amountMinor, currency: price.currency)
            }
        }
    }

    init() {}

    static func load(from directory: URL) -> WidgetPrices {
        guard let data = try? Data(contentsOf: directory.appending(path: fileName)),
              let prices = try? JSONDecoder().decode(WidgetPrices.self, from: data) else { return WidgetPrices() }
        return prices
    }

    func save(to directory: URL) {
        try? JSONEncoder().encode(self).write(to: directory.appending(path: Self.fileName), options: .atomic)
    }
}

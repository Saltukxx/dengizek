import Foundation

/// Tatil sezonu vitrinleri. Sunucudaki `season` parametresiyle aynı değerler.
enum Season: String, CaseIterable, Identifiable, Sendable, Codable {
    case termal, yaz, kis

    var id: String { rawValue }

    var title: String {
        switch self {
        case .termal: "Termal"
        case .yaz: "Yaz"
        case .kis: "Kış"
        }
    }

    var symbol: String {
        switch self {
        case .termal: "drop.fill"
        case .yaz: "sun.max.fill"
        case .kis: "snowflake"
        }
    }
}

struct Price: Codable, Hashable, Sendable {
    let amountMinor: Int
    let currency: String
    /// Doluysa fiyat bu tarihten itibaren geçerli (YYYY-MM-DD).
    let fromDate: String?
}

struct HotelCard: Codable, Hashable, Identifiable, Sendable {
    let slug: String
    let name: String
    let city: String?
    let country: String?
    let shortDescription: String?
    let imageUrl: String?
    let starRating: Int?
    let seasons: [String]
    let price: Price?
    let promotionBadge: String?
    let reviewAverage: Double?
    let reviewCount: Int
    let tourId: String?
    /// Kartta gösterilen öne çıkan olanaklar (eski sunucuda yok).
    let highlights: [String]

    var id: String { slug }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        slug = try c.decode(String.self, forKey: .slug)
        name = try c.decode(String.self, forKey: .name)
        city = try c.decodeIfPresent(String.self, forKey: .city)
        country = try c.decodeIfPresent(String.self, forKey: .country)
        shortDescription = try c.decodeIfPresent(String.self, forKey: .shortDescription)
        imageUrl = try c.decodeIfPresent(String.self, forKey: .imageUrl)
        starRating = try c.decodeIfPresent(Int.self, forKey: .starRating)
        seasons = try c.decodeIfPresent([String].self, forKey: .seasons) ?? []
        price = try c.decodeIfPresent(Price.self, forKey: .price)
        promotionBadge = try c.decodeIfPresent(String.self, forKey: .promotionBadge)
        reviewAverage = try c.decodeIfPresent(Double.self, forKey: .reviewAverage)
        reviewCount = try c.decodeIfPresent(Int.self, forKey: .reviewCount) ?? 0
        tourId = try c.decodeIfPresent(String.self, forKey: .tourId)
        highlights = try c.decodeIfPresent([String].self, forKey: .highlights) ?? []
    }
}

struct Room: Codable, Hashable, Identifiable, Sendable {
    let slug: String
    let name: String
    let tagline: String?
    let description: String?
    let sizeSqm: Int?
    let capacityAdults: Int
    let capacityChildren: Int
    let bedConfig: String?
    let viewType: String?
    let boardType: String
    let imageUrl: String?
    let galleryUrls: [String]
    let amenities: [String]

    var id: String { slug }
}

struct HotelDetail: Codable, Hashable, Sendable {
    struct GalleryImage: Codable, Hashable, Sendable {
        let url: String
        let caption: String?
    }

    struct Tour: Codable, Hashable, Identifiable, Sendable {
        let tourId: String
        let title: String
        let roomSlug: String?
        var id: String { tourId }
    }

    struct Location: Codable, Hashable, Sendable {
        let latitude: Double
        let longitude: Double
        let address: String?
    }

    struct Policies: Codable, Hashable, Sendable {
        let checkInTime: String?
        let checkOutTime: String?
        let cancellationPolicy: String?
        let childPolicy: String?
        let petsAllowed: Bool?
    }

    struct Contact: Codable, Hashable, Sendable {
        let phone: String?
        let whatsapp: String?
    }

    let slug: String
    let name: String
    let city: String?
    let country: String?
    let shortDescription: String?
    let longDescription: String?
    let imageUrl: String?
    let starRating: Int?
    let amenities: [String]
    let gallery: [GalleryImage]
    let rooms: [Room]
    let tours: [Tour]
    let location: Location?
    let policies: Policies
    let contact: Contact
}

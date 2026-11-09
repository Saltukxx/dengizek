import Foundation

struct FactCard: Codable, Hashable, Sendable {
    /// "verified" | "policy" | "otel_ifadesi"
    let kind: String
    let label: String
    let title: String?
    let text: String
}

struct PriceCard: Codable, Hashable, Sendable {
    struct Line: Codable, Hashable, Sendable {
        let label: String
        let value: String
    }

    let roomName: String
    let roomSlug: String
    let lines: [Line]
    let priceOnRequest: Bool
}

/// Sunucunun `/api/v1/guide/chat` akışında gönderdiği olaylar.
enum GuideEvent: Decodable, Equatable, Sendable {
    case text(String)
    case fact(FactCard)
    case price([PriceCard])
    case navigate(stepId: String)
    case inquiry
    case chips([String])
    case done
    case error(String)
    case unknown

    private enum CodingKeys: String, CodingKey { case type, delta, card, cards, stepId, chips, message }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "text": self = .text(try c.decode(String.self, forKey: .delta))
        case "fact": self = .fact(try c.decode(FactCard.self, forKey: .card))
        case "price": self = .price(try c.decode([PriceCard].self, forKey: .cards))
        case "navigate": self = .navigate(stepId: try c.decode(String.self, forKey: .stepId))
        case "inquiry": self = .inquiry
        case "chips": self = .chips(try c.decode([String].self, forKey: .chips))
        case "done": self = .done
        case "error": self = .error(try c.decode(String.self, forKey: .message))
        // Yeni olay türleri eski uygulamayı bozmasın.
        default: self = .unknown
        }
    }

    /// Tek bir `data: {...}` satırını çözer; başka satırlar nil döner.
    static func parse(line: String) -> GuideEvent? {
        guard line.hasPrefix("data:") else { return nil }
        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
        return try? JSONDecoder().decode(GuideEvent.self, from: Data(payload.utf8))
    }
}

struct GuideRequest: Encodable, Sendable {
    struct Message: Encodable, Sendable {
        let role: String
        let text: String
    }

    let hotelSlug: String
    let tourId: String?
    let currentStepId: String?
    let stepsSeen: [String]?
    let messages: [Message]
    let deviceId: String
}

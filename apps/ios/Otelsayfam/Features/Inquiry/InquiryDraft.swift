import Foundation

/// Talep formu verisi ve doğrulaması (sunucudaki inquiryFormSchema ile aynı kurallar).
struct InquiryDraft: Equatable, Sendable {
    enum Source: String, Sendable {
        case hotelPage = "web"
        case guide = "hotel_chat"
        case tour = "tour_player"
    }

    var name = ""
    var email = ""
    var phone = ""
    var message = ""
    var hasDates = false
    var checkIn = Calendar.current.startOfDay(for: .now).addingTimeInterval(7 * 86_400)
    var checkOut = Calendar.current.startOfDay(for: .now).addingTimeInterval(9 * 86_400)
    var adults = 2
    var children = 0
    var roomSlug: String?
    var marketingConsent = false

    /// Formdaki ilk hatanın açıklaması; geçerliyse nil.
    var validationError: String? {
        if name.trimmed.isEmpty { return "Adınızı yazın." }
        if !email.trimmed.isPlausibleEmail { return "Geçerli bir e-posta adresi yazın." }
        if message.trimmed.isEmpty { return "Mesajınızı yazın." }
        if hasDates && checkOut <= checkIn { return "Çıkış tarihi girişten sonra olmalı." }
        return nil
    }

    func body(hotelSlug: String, source: Source, tourId: String?) -> InquiryRequest {
        InquiryRequest(
            name: name.trimmed,
            email: email.trimmed,
            phone: phone.trimmed.isEmpty ? nil : phone.trimmed,
            message: message.trimmed,
            marketingConsent: marketingConsent,
            hotelSlug: hotelSlug,
            checkIn: hasDates ? Self.day(checkIn) : nil,
            checkOut: hasDates ? Self.day(checkOut) : nil,
            adults: adults,
            children: children,
            roomSlug: roomSlug,
            tourId: tourId,
            source: source.rawValue,
            locale: "tr",
            visitId: DeviceID.current
        )
    }

    private static func day(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(timeZone: .current).year().month().day())
    }
}

struct InquiryRequest: Encodable, Sendable {
    let name: String
    let email: String
    let phone: String?
    let message: String
    let marketingConsent: Bool
    let hotelSlug: String
    let checkIn: String?
    let checkOut: String?
    let adults: Int
    let children: Int
    let roomSlug: String?
    let tourId: String?
    let source: String
    let locale: String
    let visitId: String
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var isPlausibleEmail: Bool {
        let parts = split(separator: "@")
        return parts.count == 2 && !parts[0].isEmpty && parts[1].contains(".") && !contains(" ")
    }
}

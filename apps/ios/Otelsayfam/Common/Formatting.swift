import Foundation

enum Formatting {
    /// Sayı ve tarihler uygulama dilinin biçiminde yazılır; para birimi sunucudan gelir.
    private static var locale: Locale { .current }

    /// "₺8.200" — kuruş cinsinden tutarı yerel para biçimine çevirir.
    static func price(_ price: Price) -> String {
        let amount = Decimal(price.amountMinor) / 100
        return amount.formatted(.currency(code: price.currency).presentation(.narrow).locale(locale).precision(.fractionLength(0)))
    }

    /// "₺52.500" — kuruş cinsinden tutar.
    static func amount(_ minor: Int, currency: String) -> String {
        price(Price(amountMinor: minor, currency: currency, fromDate: nil))
    }

    /// "14 Kasım'dan itibaren" ya da "gecelik".
    static func priceNote(_ price: Price) -> String {
        guard let from = price.fromDate, let date = day(from) else { return String(localized: "gecelik") }
        let text = date.formatted(.dateTime.day().month(.wide).locale(locale))
        return String(localized: "\(text) tarihinden itibaren")
    }

    /// "4,8"
    static func rating(_ value: Double) -> String {
        value.formatted(.number.precision(.fractionLength(1)).locale(locale))
    }

    /// "Ekim 2026" (YYYY-MM-DD'den).
    static func monthYear(_ iso: String) -> String? {
        day(iso)?.formatted(.dateTime.month(.wide).year().locale(locale))
    }

    private static func day(_ iso: String) -> Date? {
        try? Date(iso, strategy: Date.ISO8601FormatStyle(timeZone: TimeZone(identifier: "Europe/Istanbul")!).year().month().day())
    }
}

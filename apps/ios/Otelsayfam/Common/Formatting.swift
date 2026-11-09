import Foundation

enum Formatting {
    private static let turkish = Locale(identifier: "tr_TR")

    /// "8.200 ₺" — kuruş cinsinden tutarı yerel para biçimine çevirir.
    static func price(_ price: Price) -> String {
        let amount = Decimal(price.amountMinor) / 100
        return amount.formatted(.currency(code: price.currency).locale(turkish).precision(.fractionLength(0)))
    }

    /// "14 Kasım'dan itibaren" ya da "gecelik".
    static func priceNote(_ price: Price) -> String {
        guard let from = price.fromDate, let date = day(from) else { return "gecelik" }
        let text = date.formatted(.dateTime.day().month(.wide).locale(turkish))
        return "\(text) tarihinden itibaren"
    }

    private static func day(_ iso: String) -> Date? {
        try? Date(iso, strategy: Date.ISO8601FormatStyle(timeZone: TimeZone(identifier: "Europe/Istanbul")!).year().month().day())
    }
}

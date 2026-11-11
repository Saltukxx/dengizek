import Foundation
import Testing
@testable import Otelsayfam

struct FormattingTests {
    @Test func priceUsesTurkishLira() {
        let text = Formatting.price(Price(amountMinor: 820_000, currency: "TRY", fromDate: nil))
        #expect(text.contains("8.200"))
        #expect(text.contains("₺"))
    }

    @Test func todaysPriceIsNightly() {
        #expect(Formatting.priceNote(Price(amountMinor: 1, currency: "TRY", fromDate: nil)) == "gecelik")
    }

    @Test func upcomingPriceNamesTheStartDay() {
        let note = Formatting.priceNote(Price(amountMinor: 1, currency: "TRY", fromDate: "2026-11-14"))
        #expect(note == "14 Kasım tarihinden itibaren")
    }
}

struct APIClientTests {
    let client = APIClient(baseURL: URL(string: "http://localhost:3000")!)

    @Test func resolvesRelativeUploadPaths() {
        #expect(client.resolve("/uploads/a.jpg")?.absoluteString == "http://localhost:3000/uploads/a.jpg")
    }

    @Test func keepsAbsoluteURLsAndDropsEmpty() {
        #expect(client.resolve("https://cdn.example.com/a.jpg")?.host() == "cdn.example.com")
        #expect(client.resolve("") == nil)
        #expect(client.resolve(nil) == nil)
    }

    @Test func decodesHotelCardFromServerShape() throws {
        let json = #"{"slug":"a","name":"A","city":null,"country":null,"shortDescription":null,"imageUrl":null,"starRating":null,"seasons":["termal"],"price":{"amountMinor":500000,"currency":"TRY","fromDate":"2026-11-14"},"promotionBadge":null,"reviewAverage":null,"reviewCount":0,"tourId":null}"#
        let card = try JSONDecoder().decode(HotelCard.self, from: Data(json.utf8))
        #expect(card.price?.fromDate == "2026-11-14")
    }
}

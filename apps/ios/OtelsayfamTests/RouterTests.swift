import Foundation
import Testing
@testable import Otelsayfam

struct DeepLinkTests {
    private func slug(_ text: String) -> String? {
        URL(string: text).flatMap(DeepLink.hotelSlug(from:))
    }

    @Test func appSchemeOpensHotel() {
        #expect(slug("otelsayfam://hotel/orucoglu-thermal-hotel") == "orucoglu-thermal-hotel")
        #expect(slug("otelsayfam://room/orucoglu") == nil)
        #expect(slug("otelsayfam://hotel") == nil)
    }

    @Test func webAddressOpensHotelEvenFromRoomPage() {
        #expect(slug("https://otelsayfam.com/hotels/kar-zirvesi") == "kar-zirvesi")
        #expect(slug("https://otelsayfam.com/hotels/kar-zirvesi/rooms/dag-suiti?giris=2027-01-10") == "kar-zirvesi")
        #expect(slug("https://otelsayfam.com/inquiry/portal/abc") == nil)
        #expect(slug("https://otelsayfam.com/") == nil)
    }

    @Test func rejectsOtherSchemesAndOddSlugs() {
        #expect(slug("javascript://hotel/x") == nil)
        #expect(slug("otelsayfam://hotel/..%2Fadmin") == nil)
        #expect(slug("otelsayfam://hotel/Büyük Otel") == nil)
    }

    @MainActor @Test func routerSwitchesToExploreAndPushesHotel() throws {
        let router = Router()
        router.tab = .saved
        #expect(router.open(try #require(URL(string: "otelsayfam://hotel/kar-zirvesi"))))
        #expect(router.tab == .explore)
        #expect(router.explorePath.count == 1)
        #expect(!router.open(try #require(URL(string: "https://example.com/about"))))
    }

    @Test func sharedPageUsesWebHotelRoute() throws {
        let api = APIClient(baseURL: try #require(URL(string: "https://otelsayfam.com")))
        let page = api.hotelPage(slug: "kar-zirvesi")
        #expect(page.absoluteString == "https://otelsayfam.com/hotels/kar-zirvesi")
        #expect(DeepLink.hotelSlug(from: page) == "kar-zirvesi")
    }
}

struct ReviewTests {
    @Test func oldServerWithoutReviewsStillDecodes() throws {
        let json = #"{"slug":"a","name":"A","amenities":[],"gallery":[],"rooms":[],"tours":[],"policies":{},"contact":{}}"#
        let hotel = try JSONDecoder().decode(HotelDetail.self, from: Data(json.utf8))
        #expect(hotel.reviews == nil)
    }

    @Test func reviewShowsStayMonthAndRating() throws {
        let json = #"{"average":4.8,"count":12,"items":[{"id":"r1","rating":5,"title":null,"body":"Temiz.","guestName":"Ayşe Y.","stayDate":"2026-10-02","reply":null,"createdAt":"2026-10-10T08:00:00.000Z"}]}"#
        let reviews = try JSONDecoder().decode(ReviewSummary.self, from: Data(json.utf8))
        #expect(reviews.items.first?.stayText == "Ekim 2026 konaklaması")
        #expect(Formatting.rating(4.8) == "4,8")
    }
}

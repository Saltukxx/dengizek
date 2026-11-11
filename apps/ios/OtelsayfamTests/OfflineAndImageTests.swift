import Foundation
import Testing
import UIKit
@testable import Otelsayfam

/// Ağ yerine geçen sahte sunucu: adres → yanıt ya da bağlantı hatası.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var body: Data?
    /// Gelen istekler: "POST /api/v1/price-alerts kar-zirvesi" gibi.
    nonisolated(unsafe) static var log: [String] = []

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        let sent = request.httpBodyStream.map { stream -> Data in
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let read = stream.read(&buffer, maxLength: buffer.count)
                if read <= 0 { break }
                data.append(buffer, count: read)
            }
            return data
        } ?? request.httpBody ?? Data()
        let slug = (try? JSONSerialization.jsonObject(with: sent) as? [String: String])?["hotelSlug"] ?? ""
        Self.log.append("\(request.httpMethod ?? "GET") \(request.url?.path() ?? "") \(slug)".trimmingCharacters(in: .whitespaces))
        guard let body = Self.body, let url = request.url else {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
}

/// Sahte sunucu tek bir paylaşılan yanıt tuttuğu için testler sırayla koşar.
@Suite(.serialized)
struct OfflineCacheTests {
    private func client() throws -> APIClient {
        let directory = URL.temporaryDirectory.appending(path: "ots-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        return APIClient(baseURL: try #require(URL(string: "https://otelsayfam.test")), session: StubProtocol.session(), cache: ResponseCache(directory: directory))
    }

    private let list = Data(#"{"ok":true,"hotels":[{"slug":"oruc","name":"Oruçoğlu","reviewCount":0}]}"#.utf8)

    @Test func cacheStoresAndReadsByAddress() throws {
        let cache = ResponseCache(directory: URL.temporaryDirectory.appending(path: "ots-tests-\(UUID().uuidString)"))
        let a = try #require(URL(string: "https://otelsayfam.test/api/v1/hotels?season=termal"))
        let b = try #require(URL(string: "https://otelsayfam.test/api/v1/hotels?season=kis"))
        #expect(cache.data(for: a) == nil)
        cache.store(Data("termal".utf8), for: a)
        #expect(cache.data(for: a) == Data("termal".utf8))
        #expect(cache.data(for: b) == nil)
    }

    @Test func listFallsBackToLastSavedWhenOffline() async throws {
        let api = try client()
        StubProtocol.body = list
        let fresh = try await api.browse(season: .termal, stay: StaySearch(), filters: BrowseFilters())
        #expect(!fresh.isStale)
        #expect(fresh.value.map(\.slug) == ["oruc"])

        StubProtocol.body = nil
        let stale = try await api.browse(season: .termal, stay: StaySearch(), filters: BrowseFilters())
        #expect(stale.isStale)
        #expect(stale.value.map(\.slug) == ["oruc"])
    }

    @Test func offlineWithoutSavedCopyIsUnreachable() async throws {
        let api = try client()
        StubProtocol.body = nil
        await #expect(throws: APIError.unreachable) {
            _ = try await api.browse(season: .kis, stay: StaySearch(), filters: BrowseFilters())
        }
    }

    @Test func searchNeverServesSavedResults() async throws {
        let api = try client()
        StubProtocol.body = list
        _ = try await api.hotels(query: "oruc")
        StubProtocol.body = nil
        await #expect(throws: APIError.unreachable) {
            _ = try await api.hotels(query: "oruc")
        }
    }

    @Test func unknownErrorsKeepTheirMessage() {
        #expect(APIError(APIError.notFound) == .notFound)
        #expect(APIError(URLError(.timedOut)) == .server(URLError(.timedOut).localizedDescription))
    }
}

extension OfflineCacheTests {
    /// "Fiyat düşünce haber ver" ayarı sunucuya doğru yansıyor mu?
    @MainActor
    struct PriceAlertTests {
        private func scratch() throws -> UserDefaults {
            let name = "ots.tests.alerts.\(UUID().uuidString)"
            return try #require(UserDefaults(suiteName: name))
        }

        private func api() throws -> APIClient {
            StubProtocol.body = Data(#"{"ok":true}"#.utf8)
            StubProtocol.log = []
            return APIClient(baseURL: try #require(URL(string: "https://otelsayfam.test")), session: StubProtocol.session(), cache: nil)
        }

        @Test func enablingRegistersEverySavedHotelAndPersists() async throws {
            let defaults = try scratch()
            let api = try api()
            let alerts = PriceAlerts(defaults: defaults) { .token("abc") }
            #expect(alerts.status == .off)
            await alerts.enable(slugs: ["oruc", "kar-zirvesi"], api: api)
            #expect(alerts.status == .on)
            #expect(StubProtocol.log == ["POST /api/v1/price-alerts oruc", "POST /api/v1/price-alerts kar-zirvesi"])
            #expect(PriceAlerts(defaults: defaults) { .unavailable }.status == .on)
        }

        @Test func deniedPermissionLeavesAlertsOffWithoutCallingServer() async throws {
            let api = try api()
            let alerts = PriceAlerts(defaults: try scratch()) { .denied }
            await alerts.enable(slugs: ["oruc"], api: api)
            #expect(alerts.status == .denied)
            #expect(!alerts.isOn)
            #expect(StubProtocol.log.isEmpty)
        }

        @Test func savingAndRemovingFollowTheSwitch() async throws {
            let api = try api()
            let alerts = PriceAlerts(defaults: try scratch()) { .token("abc") }
            await alerts.hotelChanged(slug: "oruc", saved: true, api: api)
            #expect(StubProtocol.log.isEmpty)

            await alerts.enable(slugs: [], api: api)
            await alerts.hotelChanged(slug: "oruc", saved: true, api: api)
            await alerts.hotelChanged(slug: "oruc", saved: false, api: api)
            #expect(StubProtocol.log == ["POST /api/v1/price-alerts oruc", "DELETE /api/v1/price-alerts oruc"])

            StubProtocol.log = []
            await alerts.disable(slugs: ["kar-zirvesi"], api: api)
            #expect(alerts.status == .off)
            #expect(StubProtocol.log == ["DELETE /api/v1/price-alerts kar-zirvesi"])
        }

        @Test func serverFailureDoesNotPretendToBeOn() async throws {
            let api = try api()
            StubProtocol.body = nil
            let alerts = PriceAlerts(defaults: try scratch()) { .token("abc") }
            await alerts.enable(slugs: ["oruc"], api: api)
            #expect(alerts.status == .unavailable)
        }
    }
}

struct SpotlightTests {
    @Test func identifierRoundTripsSlug() {
        #expect(SpotlightIndex.slug(fromIdentifier: SpotlightIndex.identifier(slug: "kar-zirvesi")) == "kar-zirvesi")
        #expect(SpotlightIndex.slug(fromIdentifier: "hotel/") == nil)
        #expect(SpotlightIndex.slug(fromIdentifier: "inquiry/abc") == nil)
    }

    @MainActor @Test func priceDropNotificationOpensHotel() {
        let center = PushCenter()
        center.open(userInfo: ["hotelSlug": "kar-zirvesi"])
        #expect(center.pendingHotelSlug == "kar-zirvesi")
        #expect(center.pendingPage == nil)
    }
}

struct WidgetSnapshotTests {
    @Test func snapshotRoundTripsThroughSharedFolder() throws {
        let directory = URL.temporaryDirectory.appending(path: "ots-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        #expect(WidgetSnapshot.load(from: directory) == nil)
        let snapshot = WidgetSnapshot(
            apiBaseURL: try #require(URL(string: "https://otelsayfam.test")),
            hotels: [.init(slug: "kar-zirvesi", name: "Kar Zirvesi", city: "Uludağ")]
        )
        try snapshot.save(to: directory)
        #expect(WidgetSnapshot.load(from: directory) == snapshot)
        #expect(snapshot.hotels[0].deepLink.absoluteString == "otelsayfam://hotel/kar-zirvesi")
        #expect(DeepLink.hotelSlug(from: snapshot.hotels[0].deepLink) == "kar-zirvesi")
    }

    @Test func widgetPricesKeepOnlyPricesValidToday() throws {
        let json = #"{"ok":true,"hotels":[{"slug":"a","price":{"amountMinor":890000,"currency":"TRY","fromDate":null}},{"slug":"b","price":{"amountMinor":500000,"currency":"TRY","fromDate":"2027-01-23"}},{"slug":"c","price":null}]}"#
        let prices = try WidgetPrices(listResponse: Data(json.utf8))
        #expect(prices.bySlug.keys.sorted() == ["a"])
        #expect(prices.bySlug["a"]?.text == "₺8.900")
    }
}

struct ImagePipelineTests {
    private func jpeg(width: CGFloat, height: CGFloat) throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
        return try #require(image.jpegData(compressionQuality: 0.8))
    }

    @Test func bucketCoversDisplayedSize() {
        #expect(ImagePipeline.bucket(points: 76, scale: 3) == 320)
        #expect(ImagePipeline.bucket(points: 370, scale: 3) == 1440)
        #expect(ImagePipeline.bucket(points: 5000, scale: 3) == 3240)
    }

    @Test func largePhotoIsDecodedAtTargetSize() throws {
        let image = try #require(ImagePipeline.downsample(try jpeg(width: 2400, height: 1600), maxPixel: 640))
        #expect(Int(image.size.width * image.scale) == 640)
        #expect(Int(image.size.height * image.scale) == 427 || Int(image.size.height * image.scale) == 426)
    }

    @Test func smallPhotoIsNotEnlarged() throws {
        let image = try #require(ImagePipeline.downsample(try jpeg(width: 300, height: 200), maxPixel: 1440))
        #expect(Int(image.size.width * image.scale) == 300)
    }

    @Test func brokenDataIsRejected() {
        #expect(ImagePipeline.downsample(Data("görsel değil".utf8), maxPixel: 640) == nil)
    }
}

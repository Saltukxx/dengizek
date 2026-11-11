import Foundation

enum APIError: LocalizedError, Equatable, Sendable {
    case server(String)
    case notFound
    case unreachable

    /// Ekranlar hatayı türüyle taşır; tanınmayan hata mesajıyla sunucu hatası sayılır.
    init(_ error: any Error) {
        self = (error as? APIError) ?? .server(error.localizedDescription)
    }

    var errorDescription: String? {
        switch self {
        case .server(let message): message
        case .notFound: String(localized: "Aradığınız kayıt bulunamadı.")
        case .unreachable: String(localized: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.")
        }
    }
}

/// Otelsayfam `/api/v1` istemcisi. Sunucu her yanıtı `{ ok, ... }` zarfında döner.
struct APIClient: Sendable {
    let baseURL: URL
    var session: URLSession = .shared
    /// Son başarılı yanıtlar (çevrimdışı gösterim); testlerde nil ya da geçici klasör.
    var cache: ResponseCache? = .shared

    static let live = APIClient(baseURL: AppConfig.apiBaseURL)

    func hotels(
        season: Season? = nil,
        query: String? = nil,
        stay: StaySearch? = nil,
        filters: BrowseFilters? = nil
    ) async throws -> [HotelCard] {
        let response: HotelsResponse = try await get("api/v1/hotels", query: Self.hotelsQuery(season: season, query: query, stay: stay, filters: filters))
        return response.hotels
    }

    private static func hotelsQuery(season: Season?, query: String?, stay: StaySearch?, filters: BrowseFilters?) -> [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let season { items.append(URLQueryItem(name: "season", value: season.rawValue)) }
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        if let stay { items += stay.queryItems }
        if let filters { items += filters.queryItems }
        return items
    }

    func hotel(slug: String) async throws -> HotelDetail {
        let response: HotelResponse = try await get("api/v1/hotels/\(slug)")
        return response.hotel
    }

    /// Keşfet listesi; bağlantı yoksa aynı aramanın son kaydı (`isStale`).
    func browse(season: Season, stay: StaySearch, filters: BrowseFilters) async throws -> Fetched<[HotelCard]> {
        let query = Self.hotelsQuery(season: season, query: nil, stay: stay, filters: filters)
        let fetched: Fetched<HotelsResponse> = try await fetch("api/v1/hotels", query: query, staleOK: true)
        return Fetched(value: fetched.value.hotels, isStale: fetched.isStale)
    }

    /// Otel sayfası; bağlantı yoksa son kayıt (`isStale`).
    func hotelPageData(slug: String) async throws -> Fetched<HotelDetail> {
        let fetched: Fetched<HotelResponse> = try await fetch("api/v1/hotels/\(slug)", staleOK: true)
        return Fetched(value: fetched.value.hotel, isStale: fetched.isStale)
    }

    /// Seçilen tarih ve kişi için oda oda toplam fiyat. Tarih hatasında
    /// (geçmiş tarih, 30 geceden uzun, otel kapalı) sunucunun Türkçe mesajıyla
    /// `APIError.server` atar.
    func quote(hotelSlug: String, stay: StaySearch) async throws -> StayQuote {
        var items = stay.queryItems
        if !stay.hasParty { items.append(URLQueryItem(name: "yetiskin", value: String(stay.adults))) }
        let response: QuoteResponse = try await get("api/v1/hotels/\(hotelSlug)/quote", query: items)
        guard let quote = response.quote else { throw APIError.server(response.error ?? String(localized: "Fiyat hesaplanamadı.")) }
        return quote
    }

    func tour(hotelSlug: String, tourId: String) async throws -> Tour {
        let response: TourResponse = try await get("api/v1/hotels/\(hotelSlug)/tours/\(tourId)")
        return response.tour
    }

    /// Talebi gönderir; talep kimliğini ve (varsa) yazışma bağlantısını döner.
    /// Sunucu doğrulama hatasını Türkçe açıklamayla döner.
    func sendInquiry(_ body: InquiryRequest) async throws -> InquiryReceipt {
        var request = URLRequest(url: baseURL.appending(path: "api/v1/inquiries"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.unreachable
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
            throw APIError.server(failure?.error ?? (status == 429 ? String(localized: "Çok fazla talep gönderdiniz, biraz sonra tekrar deneyin.") : String(localized: "Talep gönderilemedi.")))
        }
        return try JSONDecoder().decode(InquiryReceipt.self, from: data)
    }

    /// Talep yazışması; bağlantı yoksa son kayıt (`isStale`). Bağlantının
    /// süresi dolduysa ya da iptal edildiyse `APIError.notFound`.
    func inquiryThread(token: String) async throws -> Fetched<InquiryThread> {
        try await fetch("api/v1/inquiries/portal/\(token)/messages", staleOK: true)
    }

    /// Yazışmaya mesaj ekler. Sunucu doğrulama hatasını (ör. telefon/e-posta
    /// içeren mesaj, kapatılmış talep) Türkçe açıklamayla döner.
    func sendInquiryMessage(token: String, body: String) async throws -> InquiryMessage {
        var request = URLRequest(url: baseURL.appending(path: "api/v1/inquiries/portal/\(token)/messages"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["body": body])
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.unreachable
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw APIError.notFound }
        guard (200..<300).contains(status) else {
            let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
            throw APIError.server(failure?.error ?? (status == 429 ? String(localized: "Çok fazla mesaj gönderdiniz, biraz sonra tekrar deneyin.") : String(localized: "Mesaj gönderilemedi.")))
        }
        return try JSONDecoder().decode(MessageResponse.self, from: data).message
    }

    /// Cihazı talebe bağlar: yönetici cevap yazınca bildirim gelir.
    func registerPush(inquiryId: String, deviceToken: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/v1/push/register"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["inquiryId": inquiryId, "deviceToken": deviceToken, "environment": PushCenter.environment])
        let (data, response) = try await session.data(for: request)
        guard (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0) else {
            let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
            throw APIError.server(failure?.error ?? String(localized: "Bildirim kaydı yapılamadı."))
        }
    }

    /// "Fiyat düşünce haber ver": cihazı otele bağlar ya da bağı kaldırır.
    func setPriceAlert(hotelSlug: String, deviceToken: String, enabled: Bool) async throws {
        var request = URLRequest(url: baseURL.appending(path: "api/v1/price-alerts"))
        request.httpMethod = enabled ? "POST" : "DELETE"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["hotelSlug": hotelSlug, "deviceToken": deviceToken, "environment": PushCenter.environment])
        let (data, response) = try await session.data(for: request)
        guard (200..<300).contains((response as? HTTPURLResponse)?.statusCode ?? 0) else {
            let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
            throw APIError.server(failure?.error ?? String(localized: "Fiyat bildirimi ayarlanamadı."))
        }
    }

    /// Bir cümleyi sunucudaki Piper sesiyle seslendirir (WAV). Servis yoksa hata fırlatır.
    func speak(_ text: String) async throws -> Data {
        var request = URLRequest(url: baseURL.appending(path: "api/voice/speak"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["text": text])
        request.timeoutInterval = 15
        let (data, response) = try await session.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200, data.count > 44 else {
            throw APIError.server(String(localized: "Ses üretilemedi."))
        }
        return data
    }

    /// Rehber cevabını olay olay akıtır (`/api/v1/guide/chat`, SSE).
    func guide(_ body: GuideRequest) -> AsyncThrowingStream<GuideEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: baseURL.appending(path: "api/v1/guide/chat"))
                    request.httpMethod = "POST"
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    request.httpBody = try JSONEncoder().encode(body)
                    request.timeoutInterval = 60

                    let (bytes, response) = try await session.bytes(for: request)
                    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard (200..<300).contains(status) else {
                        var data = Data()
                        for try await byte in bytes { data.append(byte) }
                        let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
                        throw APIError.server(failure?.error ?? (status == 429 ? String(localized: "Çok fazla soru sordunuz, biraz sonra tekrar deneyin.") : String(localized: "Rehber şu an cevap veremedi.")))
                    }
                    for try await line in bytes.lines {
                        if let event = GuideEvent.parse(line: line) { continuation.yield(event) }
                    }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch let error as APIError {
                    continuation.finish(throwing: error)
                } catch {
                    continuation.finish(throwing: Task.isCancelled ? CancellationError() : APIError.unreachable)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// Otelin web sayfası: paylaşılır, uygulama yüklüyse otel sayfasını açar.
    func hotelPage(slug: String) -> URL {
        baseURL.appending(path: "hotels/\(slug)")
    }

    /// Sunucunun döndüğü göreli yolları (`/uploads/...`) tam adrese çevirir.
    func resolve(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    private func get<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await fetch(path, query: query, staleOK: false).value
    }

    /// `staleOK`: sunucuya ulaşılamazsa aynı adresin son başarılı yanıtı döner.
    private func fetch<T: Decodable & Sendable>(_ path: String, query: [URLQueryItem] = [], staleOK: Bool) async throws -> Fetched<T> {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        let url = components.url!
        var request = URLRequest(url: url)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(Locale.current.language.languageCode?.identifier ?? "tr", forHTTPHeaderField: "Accept-Language")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            if Task.isCancelled { throw CancellationError() }
            if staleOK, let saved = cache?.data(for: url), let value = try? JSONDecoder().decode(T.self, from: saved) {
                return Fetched(value: value, isStale: true)
            }
            throw APIError.unreachable
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw APIError.notFound }
        guard (200..<300).contains(status) else {
            let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
            throw APIError.server(failure?.error ?? String(localized: "Beklenmeyen bir hata oluştu (\(status))."))
        }
        let value = try JSONDecoder().decode(T.self, from: data)
        if staleOK { cache?.store(data, for: url) }
        return Fetched(value: value, isStale: false)
    }
}

private struct HotelsResponse: Decodable, Sendable { let hotels: [HotelCard] }
private struct HotelResponse: Decodable, Sendable { let hotel: HotelDetail }
private struct TourResponse: Decodable, Sendable { let tour: Tour }
private struct QuoteResponse: Decodable, Sendable {
    let quote: StayQuote?
    let error: String?
}
private struct MessageResponse: Decodable, Sendable { let message: InquiryMessage }
private struct FailureResponse: Decodable { let error: String? }

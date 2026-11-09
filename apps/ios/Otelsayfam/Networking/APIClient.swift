import Foundation

enum APIError: LocalizedError {
    case server(String)
    case notFound
    case unreachable

    var errorDescription: String? {
        switch self {
        case .server(let message): message
        case .notFound: "Aradığınız kayıt bulunamadı."
        case .unreachable: "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin."
        }
    }
}

/// Otelsayfam `/api/v1` istemcisi. Sunucu her yanıtı `{ ok, ... }` zarfında döner.
struct APIClient: Sendable {
    let baseURL: URL
    var session: URLSession = .shared

    static let live = APIClient(baseURL: AppConfig.apiBaseURL)

    func hotels(season: Season? = nil, query: String? = nil) async throws -> [HotelCard] {
        var items: [URLQueryItem] = []
        if let season { items.append(URLQueryItem(name: "season", value: season.rawValue)) }
        if let query, !query.isEmpty { items.append(URLQueryItem(name: "q", value: query)) }
        let response: HotelsResponse = try await get("api/v1/hotels", query: items)
        return response.hotels
    }

    func hotel(slug: String) async throws -> HotelDetail {
        let response: HotelResponse = try await get("api/v1/hotels/\(slug)")
        return response.hotel
    }

    func tour(hotelSlug: String, tourId: String) async throws -> Tour {
        let response: TourResponse = try await get("api/v1/hotels/\(hotelSlug)/tours/\(tourId)")
        return response.tour
    }

    /// Talebi gönderir, talep kimliğini döner. Sunucu doğrulama hatasını Türkçe açıklamayla döner.
    func sendInquiry(_ body: InquiryRequest) async throws -> String {
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
            throw APIError.server(failure?.error ?? (status == 429 ? "Çok fazla talep gönderdiniz, biraz sonra tekrar deneyin." : "Talep gönderilemedi."))
        }
        return try JSONDecoder().decode(InquiryCreated.self, from: data).id
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
            throw APIError.server(failure?.error ?? "Bildirim kaydı yapılamadı.")
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
            throw APIError.server("Ses üretilemedi.")
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
                        throw APIError.server(failure?.error ?? (status == 429 ? "Çok fazla soru sordunuz, biraz sonra tekrar deneyin." : "Rehber şu an cevap veremedi."))
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

    /// Sunucunun döndüğü göreli yolları (`/uploads/...`) tam adrese çevirir.
    func resolve(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        return URL(string: path, relativeTo: baseURL)?.absoluteURL
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }
        var request = URLRequest(url: components.url!)
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            if Task.isCancelled { throw CancellationError() }
            throw APIError.unreachable
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 404 { throw APIError.notFound }
        guard (200..<300).contains(status) else {
            let failure = try? JSONDecoder().decode(FailureResponse.self, from: data)
            throw APIError.server(failure?.error ?? "Beklenmeyen bir hata oluştu (\(status)).")
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}

private struct HotelsResponse: Decodable { let hotels: [HotelCard] }
private struct HotelResponse: Decodable { let hotel: HotelDetail }
private struct TourResponse: Decodable { let tour: Tour }
private struct InquiryCreated: Decodable { let id: String }
private struct FailureResponse: Decodable { let error: String? }

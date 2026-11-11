import Foundation
import Observation

/// "Fiyat düşünce haber ver": açıkken kaydedilen her otel sunucuya bu cihazın
/// bildirim kimliğiyle bildirilir; sunucu fiyat düşünce bildirim gönderir.
/// Ayar ve kimlik cihazda durur, hesap gerekmez.
@MainActor
@Observable
final class PriceAlerts {
    static let shared = PriceAlerts()

    enum Status: Equatable, Sendable {
        case off
        case working
        case on
        /// Misafir bildirim iznini vermedi.
        case denied
        /// İzin var ama cihaz kimliği alınamadı ya da sunucuya ulaşılamadı.
        case unavailable
    }

    private(set) var status: Status

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let requestToken: @MainActor () async -> PushCenter.TokenResult

    private static let enabledKey = "ots.priceAlerts"
    private static let tokenKey = "ots.pushToken"

    init(
        defaults: UserDefaults = .standard,
        requestToken: @escaping @MainActor () async -> PushCenter.TokenResult = { await PushCenter.shared.requestToken() }
    ) {
        self.defaults = defaults
        self.requestToken = requestToken
        status = defaults.bool(forKey: Self.enabledKey) ? .on : .off
    }

    var isOn: Bool { status == .on || status == .working }

    private var token: String? { defaults.string(forKey: Self.tokenKey) }

    /// İzin ister, kaydedilen otelleri sunucuya bildirir.
    func enable(slugs: [String], api: APIClient) async {
        status = .working
        switch await requestToken() {
        case .denied:
            status = .denied
        case .unavailable:
            status = .unavailable
        case .token(let token):
            do {
                for slug in slugs { try await api.setPriceAlert(hotelSlug: slug, deviceToken: token, enabled: true) }
                defaults.set(token, forKey: Self.tokenKey)
                defaults.set(true, forKey: Self.enabledKey)
                status = .on
            } catch {
                status = .unavailable
            }
        }
    }

    /// Kapatır; sunucudaki kayıtlar silinir (ulaşılamazsa cihaz yine kapalı sayar).
    func disable(slugs: [String], api: APIClient) async {
        let token = token
        defaults.set(false, forKey: Self.enabledKey)
        status = .off
        guard let token else { return }
        for slug in slugs { try? await api.setPriceAlert(hotelSlug: slug, deviceToken: token, enabled: false) }
    }

    /// Otel kaydedildi ya da kayıttan çıkarıldı: açıksa sunucuya yansıt.
    func hotelChanged(slug: String, saved: Bool, api: APIClient) async {
        guard status == .on, let token else { return }
        try? await api.setPriceAlert(hotelSlug: slug, deviceToken: token, enabled: saved)
    }

    /// Açılışta: cihaz kimliği değişmiş olabilir; açıksa yeniden alıp kayıtları tazeler.
    func refresh(slugs: [String], api: APIClient) async {
        guard status == .on, case .token(let fresh) = await requestToken(), fresh != token else { return }
        for slug in slugs { try? await api.setPriceAlert(hotelSlug: slug, deviceToken: fresh, enabled: true) }
        defaults.set(fresh, forKey: Self.tokenKey)
    }
}

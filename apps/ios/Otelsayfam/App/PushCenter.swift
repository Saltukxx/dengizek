import Observation
import SafariServices
import SwiftUI
import UIKit
import UserNotifications

/// Bildirim izni, cihaz kimliği ve bildirime dokunulunca açılacak sayfa.
@MainActor
@Observable
final class PushCenter {
    static let shared = PushCenter()

    init() {}

    /// Bildirime dokunulunca açılacak portal sayfası (kök görünüm sunar).
    var pendingPage: WebPage?

    /// Son cevap bildirimi: hangi talep, misafir dokunup açtı mı?
    struct ReplyEvent: Equatable {
        let inquiryId: String
        let opened: Bool
        var at = Date.now
    }

    var replyEvent: ReplyEvent?

    /// Fiyat düşüşü bildirimine dokunuldu: açılacak otel (kök görünüm açar ve sıfırlar).
    var pendingHotelSlug: String?

    enum TokenResult: Equatable, Sendable {
        case token(String)
        /// Misafir bildirim iznini vermedi.
        case denied
        /// İzin var, cihaz kimliği alınamadı (ör. imza profilinde bildirim yetkisi yok).
        case unavailable
    }

    @ObservationIgnored private var tokenWaiters: [CheckedContinuation<String?, Never>] = []

    /// Xcode/TestFlight derlemeleri sandbox APNs'e, App Store derlemesi production'a kayıtlıdır.
    nonisolated static var environment: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

    /// İzin ister ve APNs cihaz kimliğini döner; izin yoksa ya da kayıt başarısızsa nil.
    func requestDeviceToken() async -> String? {
        if case .token(let token) = await requestToken() { token } else { nil }
    }

    /// İzin ister ve APNs cihaz kimliğini döner; neden alınamadığını da bildirir.
    func requestToken() async -> TokenResult {
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { return .denied }
        let token: String? = await withCheckedContinuation { continuation in
            tokenWaiters.append(continuation)
            UIApplication.shared.registerForRemoteNotifications()
        }
        return token.map(TokenResult.token) ?? .unavailable
    }

    func didRegister(token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        resolve(hex)
    }

    func didFailToRegister() { resolve(nil) }

    func open(userInfo: [AnyHashable: Any]) {
        if let inquiryId = userInfo["inquiryId"] as? String { replyEvent = ReplyEvent(inquiryId: inquiryId, opened: true) }
        if let slug = userInfo["hotelSlug"] as? String, !slug.isEmpty { pendingHotelSlug = slug }
        guard let raw = userInfo["portalUrl"] as? String, let url = URL(string: raw), url.scheme?.hasPrefix("http") == true else { return }
        pendingPage = WebPage(url: url)
    }

    /// Uygulama açıkken gelen cevap bildirimi (henüz dokunulmadı).
    func received(inquiryId: String) {
        replyEvent = ReplyEvent(inquiryId: inquiryId, opened: false)
    }

    private func resolve(_ token: String?) {
        let waiters = tokenWaiters
        tokenWaiters.removeAll()
        waiters.forEach { $0.resume(returning: token) }
    }
}

struct WebPage: Identifiable, Hashable {
    let url: URL
    var id: URL { url }
}

/// Uygulama içinde web sayfası (talep portalı).
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// Yön kilidi: iPhone'da yalnız tur açıkken yatay (bkz. OrientationLock).
    func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        MainActor.assumeIsolated { OrientationLock.mask }
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushCenter.shared.didRegister(token: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        MainActor.assumeIsolated { PushCenter.shared.didFailToRegister() }
    }

    /// Uygulama açıkken de bildirim üstte görünsün.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        if let inquiryId = notification.request.content.userInfo["inquiryId"] as? String {
            await MainActor.run { PushCenter.shared.received(inquiryId: inquiryId) }
        }
        return [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let userInfo = response.notification.request.content.userInfo
        var fields: [String: String] = [:]
        for key in ["portalUrl", "inquiryId", "hotelSlug"] {
            if let value = userInfo[key] as? String { fields[key] = value }
        }
        await MainActor.run { PushCenter.shared.open(userInfo: fields) }
    }
}

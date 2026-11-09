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
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
        guard granted else { return nil }
        return await withCheckedContinuation { continuation in
            tokenWaiters.append(continuation)
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    func didRegister(token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        resolve(hex)
    }

    func didFailToRegister() { resolve(nil) }

    func open(userInfo: [AnyHashable: Any]) {
        guard let raw = userInfo["portalUrl"] as? String, let url = URL(string: raw), url.scheme?.hasPrefix("http") == true else { return }
        pendingPage = WebPage(url: url)
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

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MainActor.assumeIsolated { PushCenter.shared.didRegister(token: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        MainActor.assumeIsolated { PushCenter.shared.didFailToRegister() }
    }

    /// Uygulama açıkken de bildirim üstte görünsün.
    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let userInfo = response.notification.request.content.userInfo
        let portal = userInfo["portalUrl"] as? String
        await MainActor.run { PushCenter.shared.open(userInfo: portal.map { ["portalUrl": $0] } ?? [:]) }
    }
}

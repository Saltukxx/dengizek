import UIKit

/// iPhone'da uygulama dikeydir; yalnız video tur açıkken yatay çevrilebilir
/// (yatay çekilmiş video ekranı doldurur). iPad her yönde çalışır.
@MainActor
enum OrientationLock {
    private(set) static var allowsLandscape = false

    static var mask: UIInterfaceOrientationMask {
        if UIDevice.current.userInterfaceIdiom == .pad { return .all }
        return allowsLandscape ? .allButUpsideDown : .portrait
    }

    /// Telefon şu an yatay tutuluyorsa ona karşılık gelen arayüz yönü
    /// (cihaz sola yatıkken arayüz "sağ yatay"dır).
    private static var heldLandscape: UIInterfaceOrientationMask? {
        switch UIDevice.current.orientation {
        case .landscapeLeft: .landscapeRight
        case .landscapeRight: .landscapeLeft
        default: nil
        }
    }

    /// Tur açılırken `true`, kapanırken `false`: kapanınca ekran dikeye döner.
    static func setLandscapeAllowed(_ allowed: Bool) {
        guard allowsLandscape != allowed else { return }
        allowsLandscape = allowed
        for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
            for window in scene.windows {
                window.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
            }
            guard UIDevice.current.userInterfaceIdiom == .phone else { continue }
            if !allowed {
                scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
            } else if let held = heldLandscape {
                // Telefon zaten yatay tutuluyorsa tur o yöne açıkça döndürülür: yalnız
                // "desteklenen yönler değişti" bildirimi sunum animasyonu sırasında kaçabiliyor.
                scene.requestGeometryUpdate(.iOS(interfaceOrientations: held))
            }
        }
    }
}

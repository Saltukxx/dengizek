import Foundation

/// Uygulamanın anonim cihaz kimliği: rehber sorularını aynı ziyarete bağlar.
/// Kişisel veri değildir; uygulama silinince yenisi üretilir.
enum DeviceID {
    private static let key = "ots.deviceId"

    static var current: String {
        if let existing = UserDefaults.standard.string(forKey: key) { return existing }
        let id = UUID().uuidString.lowercased()
        UserDefaults.standard.set(id, forKey: key)
        return id
    }
}

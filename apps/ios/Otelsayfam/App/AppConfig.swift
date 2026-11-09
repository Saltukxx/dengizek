import Foundation

/// Sunucu adresi Info.plist'teki OTSApiBaseURL'den gelir (Debug: localhost:3000).
enum AppConfig {
    static let apiBaseURL: URL = {
        guard
            let raw = Bundle.main.object(forInfoDictionaryKey: "OTSApiBaseURL") as? String,
            let url = URL(string: raw)
        else { return URL(string: "http://localhost:3000")! }
        return url
    }()
}

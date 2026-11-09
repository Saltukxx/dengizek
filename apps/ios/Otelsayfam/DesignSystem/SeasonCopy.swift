import Foundation

/// Vitrin metinleri — web'deki SHOWCASE_CONFIGS (lib/marketing/showcase-config.ts) ile aynı.
extension Season {
    var headline: String {
        switch self {
        case .yaz: "Otele gitmeden önce içini gezin."
        case .kis: "Kışı, gitmeden önce yaşayın."
        case .termal: "Termal oteli gitmeden gezin, merak ettiğinizi sorun."
        }
    }

    var lede: String {
        switch self {
        case .yaz:
            "Oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır. Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın."
        case .kis:
            "Kayak otellerini fotoğraftan değil, odasından pistine duraklı video turla tanıyın. Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden alın."
        case .termal:
            "Termal oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır. Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın."
        }
    }

    /// "56 termal otel yayında"
    var hotelsStat: String {
        switch self {
        case .yaz: "otel yayında"
        case .kis: "kış oteli yayında"
        case .termal: "termal otel yayında"
        }
    }
}

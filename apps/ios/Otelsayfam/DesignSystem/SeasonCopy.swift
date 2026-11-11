import Foundation

/// Vitrin metinleri — web'deki SHOWCASE_CONFIGS (lib/marketing/showcase-config.ts) ile aynı.
extension Season {
    var headline: String {
        switch self {
        case .yaz: String(localized: "Otele gitmeden önce içini gezin.")
        case .kis: String(localized: "Kışı, gitmeden önce yaşayın.")
        case .termal: String(localized: "Termal oteli gitmeden gezin, merak ettiğinizi sorun.")
        }
    }

    /// Banner açıklaması: web lede'sinin ilk cümlesi (ikinci cümle tanıtım bölümünde).
    var lede: String {
        switch self {
        case .yaz: String(localized: "Otelsayfam’da oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır.")
        case .kis: String(localized: "Kayak otellerini fotoğraftan değil, odasından pistine duraklı video turla tanıyın.")
        case .termal: String(localized: "Otelsayfam’da termal oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır.")
        }
    }

    /// "56 termal otel yayında"
    func hotelsStat(_ count: Int) -> String {
        switch self {
        case .yaz: String(localized: "\(count) otel yayında")
        case .kis: String(localized: "\(count) kış oteli yayında")
        case .termal: String(localized: "\(count) termal otel yayında")
        }
    }

    // MARK: Tanıtım bölümü (web: showcase-intro / ai-steps)

    /// Tur durakları (web script.stops); ikincisi "\(followUp)" ile açılan durak.
    var tourStops: [String] {
        switch self {
        case .yaz: [String(localized: "Restoran"), String(localized: "Plaj"), String(localized: "Havuz")]
        case .kis: [String(localized: "Gondol"), String(localized: "Şömineli oda"), String(localized: "Pist")]
        case .termal: [String(localized: "Termal havuz"), String(localized: "Spa"), String(localized: "Açık havuz")]
        }
    }

    var followUp: String {
        switch self {
        case .yaz: String(localized: "Plajı göster")
        case .kis: String(localized: "Şömineli odayı göster")
        case .termal: String(localized: "Spayı göster")
        }
    }

    var followUpReply: String {
        switch self {
        case .yaz: String(localized: "Plaja geçiyorum.")
        case .kis: String(localized: "Şömineli odaya geçiyorum.")
        case .termal: String(localized: "Spa merkezine geçiyorum.")
        }
    }

    var voiceExample: String {
        switch self {
        case .yaz: String(localized: "“Plaja yürüyerek kaç dakika?”")
        case .kis: String(localized: "“Kayak dolabı odaya yakın mı?”")
        case .termal: String(localized: "“Kapalı havuz akşam kaça kadar açık?”")
        }
    }
}

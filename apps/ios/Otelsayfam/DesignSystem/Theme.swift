import SwiftUI
import UIKit

// Web'deki "Elite Reserve" tasarım sistemi (apps/web/src/app/globals.css):
// :root (yaz), .er-thermal (termal) ve .er-winter (kış "Alpine Nocturne")
// token'ları birebir. Bir değer web'de değişirse burada da değişmeli.

struct Theme: Sendable {
    let season: Season
    let isDark: Bool

    // Marka
    let primary: Color
    let primaryStrong: Color
    let primaryTint: Color
    let navy: Color
    let cta: Color
    let ctaTint: Color

    // Yüzey
    let bg: Color
    let surface: Color
    let surface2: Color
    let surface3: Color

    // Metin & çizgi
    let text: Color
    let textMuted: Color
    let textDim: Color
    let line: Color
    let lineStrong: Color

    // Vitrin banner tonları (--tm-*)
    let deep: Color
    let deep2: Color
    let sand: Color
    let sand2: Color
    let glow: Color
    let inkOnDeep: Color
    let mutedOnDeep: Color

    // Şekil
    let radiusSmall: CGFloat
    let radius: CGFloat
    let radiusMedium: CGFloat
    let radiusLarge: CGFloat
    let shadow: Color

    // Tipografi
    let displayFamily: FontFamily
    let sansFamily: FontFamily

    static func forSeason(_ season: Season) -> Theme {
        switch season {
        case .yaz: .yaz
        case .termal: .termal
        case .kis: .kis
        }
    }

    static let yaz = Theme(
        season: .yaz, isDark: false,
        primary: Color(hex: 0x1C56A6), primaryStrong: Color(hex: 0x003E84), primaryTint: Color(hex: 0x1C56A6, opacity: 0.08),
        navy: Color(hex: 0x0E1F40), cta: Color(hex: 0xC2410C), ctaTint: Color(hex: 0xC2410C, opacity: 0.1),
        bg: Color(hex: 0xF8F9FA), surface: .white, surface2: Color(hex: 0xF3F4F5), surface3: Color(hex: 0xEDEEEF),
        text: Color(hex: 0x0E1F40), textMuted: Color(hex: 0x424751), textDim: Color(hex: 0x6B6F78),
        line: Color(hex: 0xE1E3E4), lineStrong: Color(hex: 0xC3C6D3),
        deep: Color(hex: 0x0E1F40), deep2: Color(hex: 0x0A1630), sand: Color(hex: 0xFFC58F), sand2: Color(hex: 0xF08A4B),
        glow: Color(red: 120 / 255, green: 170 / 255, blue: 1, opacity: 0.18),
        inkOnDeep: Color(hex: 0xFFFDF9), mutedOnDeep: Color(hex: 0xFFFDF9, opacity: 0.78),
        radiusSmall: 4, radius: 8, radiusMedium: 12, radiusLarge: 16,
        shadow: Color(hex: 0x0E1F40, opacity: 0.08),
        displayFamily: .manrope, sansFamily: .plusJakarta
    )

    static let termal = Theme(
        season: .termal, isDark: false,
        primary: Color(hex: 0x1D5C58), primaryStrong: Color(hex: 0x0F3633), primaryTint: Color(hex: 0x1D5C58, opacity: 0.08),
        navy: Color(hex: 0x1F2A2A), cta: Color(hex: 0xA44A24), ctaTint: Color(hex: 0xA44A24, opacity: 0.1),
        bg: Color(hex: 0xF7F3EC), surface: Color(hex: 0xFFFDF9), surface2: Color(hex: 0xF1EBE1), surface3: Color(hex: 0xE9E1D4),
        text: Color(hex: 0x1F2A2A), textMuted: Color(hex: 0x4A4F4C), textDim: Color(hex: 0x686B65),
        line: Color(hex: 0xE5DDD0), lineStrong: Color(hex: 0xCFC4B2),
        deep: Color(hex: 0x0F3633), deep2: Color(hex: 0x0B2A28), sand: Color(hex: 0xF1C9A8), sand2: Color(hex: 0xD98A5C),
        glow: Color(red: 120 / 255, green: 200 / 255, blue: 190 / 255, opacity: 0.16),
        inkOnDeep: Color(hex: 0xFFFDF9), mutedOnDeep: Color(hex: 0xFFFDF9, opacity: 0.78),
        radiusSmall: 4, radius: 10, radiusMedium: 14, radiusLarge: 18,
        shadow: Color(hex: 0x1F2A2A, opacity: 0.08),
        displayFamily: .ebGaramond, sansFamily: .plusJakarta
    )

    static let kis = Theme(
        season: .kis, isDark: true,
        primary: Color(hex: 0x8DCBE6), primaryStrong: Color(hex: 0x081827), primaryTint: Color(hex: 0x8DCBE6, opacity: 0.1),
        navy: Color(hex: 0x081827), cta: Color(hex: 0xA94724), ctaTint: Color(hex: 0xA94724, opacity: 0.14),
        bg: Color(hex: 0x101415), surface: Color(hex: 0x181C1D), surface2: Color(hex: 0x1F2425), surface3: Color(hex: 0x292E2F),
        text: Color(hex: 0xF3F6F7), textMuted: Color(hex: 0xC4C9CC), textDim: Color(hex: 0x8F999E),
        line: Color(hex: 0x8DCBE6, opacity: 0.14), lineStrong: Color(hex: 0x8DCBE6, opacity: 0.3),
        deep: Color(hex: 0x0D2236), deep2: Color(hex: 0x081827), sand: Color(hex: 0x8DCBE6), sand2: Color(hex: 0x4F9FC4),
        glow: Color(hex: 0x8DCBE6, opacity: 0.16),
        inkOnDeep: Color(hex: 0xF3F6F7), mutedOnDeep: Color(hex: 0xF3F6F7, opacity: 0.78),
        radiusSmall: 4, radius: 4, radiusMedium: 4, radiusLarge: 4,
        shadow: .black.opacity(0.32),
        displayFamily: .ebGaramond, sansFamily: .hankenGrotesk
    )

    /// Başlık çubuğu zemini (web .er-header): açık temalarda sıcak beyaz, kışta gece mavisi.
    var headerBackground: Color {
        switch season {
        case .yaz: Color(hex: 0xF3F0E8)
        case .termal: Color(hex: 0xF3EEE5)
        case .kis: Color(hex: 0x081827)
        }
    }

    /// Başlık çubuğunun altındaki renkli çizgi ve seçili sezonun alt çizgisi.
    var headerRule: Color {
        switch season {
        case .yaz: primary
        case .termal: cta
        case .kis: primary
        }
    }

    /// Kış temasında birincil düğme açık mavi olduğundan üstündeki yazı koyu olmalı.
    var onPrimary: Color { isDark ? navy : .white }
}

extension EnvironmentValues {
    @Entry var theme: Theme = .termal
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}

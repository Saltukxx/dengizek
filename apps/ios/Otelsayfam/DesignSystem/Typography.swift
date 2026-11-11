import SwiftUI
import UIKit

/// Web'in yazı tipleri (Google Fonts, OFL). Dosyalar değişken ağırlıklı:
/// ağırlık `wght` ekseniyle verilir, boyut Dinamik Yazı'ya göre ölçeklenir.
enum FontFamily: String, Sendable {
    case manrope = "Manrope-ExtraLight"
    case plusJakarta = "PlusJakartaSans-Regular"
    case ebGaramond = "EBGaramond-Regular"
    case hankenGrotesk = "HankenGrotesk-Regular"

    /// Web'deki başlık ağırlığı (.er-display 700; serif başlıklar daha ince 600).
    var displayWeight: CGFloat { self == .ebGaramond ? 600 : 700 }
}

enum Typography {
    private static let weightAxis = 0x7767_6874 // 'wght'

    static func font(_ family: FontFamily, size: CGFloat, weight: CGFloat = 400, relativeTo style: UIFont.TextStyle = .body) -> Font {
        let descriptor = UIFontDescriptor(fontAttributes: [
            .name: family.rawValue,
            UIFontDescriptor.AttributeName(rawValue: kCTFontVariationAttribute as String): [weightAxis: weight],
        ])
        let base = UIFont(descriptor: descriptor, size: size)
        return Font(UIFontMetrics(forTextStyle: style).scaledFont(for: base))
    }
}

extension Theme {
    /// Büyük başlık (.er-display): yaz Manrope, termal/kış EB Garamond.
    func display(_ size: CGFloat, style: UIFont.TextStyle = .title1) -> Font {
        Typography.font(displayFamily, size: size, weight: displayFamily.displayWeight, relativeTo: style)
    }

    /// Gövde yazısı: yaz/termal Plus Jakarta Sans, kış Hanken Grotesk.
    func body(_ size: CGFloat = 16, weight: CGFloat = 400, style: UIFont.TextStyle = .body) -> Font {
        Typography.font(sansFamily, size: size, weight: weight, relativeTo: style)
    }
}

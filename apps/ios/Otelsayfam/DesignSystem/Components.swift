import SwiftUI

/// Web kartı (.er-hotel-card vb.): yüzey, ince çizgi, yumuşak gölge.
struct CardSurface: ViewModifier {
    @Environment(\.theme) private var theme
    var radius: CGFloat?

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius ?? theme.radiusMedium, style: .continuous)
        content
            .background(theme.surface, in: shape)
            .clipShape(shape)
            .overlay(shape.strokeBorder(theme.line))
            .shadow(color: theme.shadow, radius: theme.isDark ? 18 : 10, y: theme.isDark ? 10 : 4)
    }
}

extension View {
    func cardSurface(radius: CGFloat? = nil) -> some View { modifier(CardSurface(radius: radius)) }
}

/// Vitrin banner zemini: koyu degrade + hafif hale (web .er-showcase / page-banner).
struct DeepBackground: View {
    @Environment(\.theme) private var theme

    var body: some View {
        ZStack {
            LinearGradient(colors: [theme.deep, theme.deep2], startPoint: .top, endPoint: .bottom)
            RadialGradient(colors: [theme.glow, .clear], center: UnitPoint(x: 0.15, y: 0.1), startRadius: 0, endRadius: 420)
        }
    }
}

/// Düğme stilleri: dolu birincil, eylem (talep/fiyat), çerçeveli.
struct OTSButtonStyle: ButtonStyle {
    enum Kind { case primary, cta, outline }
    @Environment(\.theme) private var theme
    var kind: Kind = .primary

    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: theme.radius, style: .continuous)
        configuration.label
            .font(theme.body(16, weight: 600, style: .headline))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .padding(.horizontal, 18)
            .foregroundStyle(foreground)
            .background(background, in: shape)
            .overlay(shape.strokeBorder(kind == .outline ? theme.lineStrong : .clear))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }

    private var foreground: Color {
        switch kind {
        case .primary: theme.onPrimary
        case .cta: .white
        case .outline: theme.isDark ? theme.text : theme.primary
        }
    }

    private var background: Color {
        switch kind {
        case .primary: theme.primary
        case .cta: theme.cta
        case .outline: theme.surface
        }
    }
}

extension ButtonStyle where Self == OTSButtonStyle {
    static var otsPrimary: OTSButtonStyle { OTSButtonStyle(kind: .primary) }
    static var otsCTA: OTSButtonStyle { OTSButtonStyle(kind: .cta) }
    static var otsOutline: OTSButtonStyle { OTSButtonStyle(kind: .outline) }
}

/// Rehberin turuncu degrade simgesi (web "Yapay Zeka Rehberi" rozeti).
struct GuideAvatar: View {
    @Environment(\.theme) private var theme
    var size: CGFloat = 28

    var body: some View {
        Image(systemName: "sparkles")
            .font(.system(size: size * 0.5, weight: .semibold))
            .foregroundStyle(theme.isDark ? theme.navy : Color(hex: 0x3B1E0E))
            .frame(width: size, height: size)
            .background(LinearGradient(colors: [theme.sand, theme.sand2], startPoint: .topLeading, endPoint: .bottomTrailing), in: .circle)
            .accessibilityHidden(true)
    }
}

/// Olanak adı → SF Symbol (web'deki ikonlu olanak kutuları).
enum AmenityIcon {
    static func symbol(for name: String) -> String {
        let key = name.lowercased(with: Locale(identifier: "tr_TR"))
        let table: [(String, String)] = [
            ("termal", "drop.fill"), ("havuz", "figure.pool.swim"), ("hamam", "humidity.fill"), ("sauna", "flame"),
            ("spa", "sparkles"), ("masaj", "hand.raised"), ("fitness", "dumbbell"), ("spor", "dumbbell"),
            ("wi", "wifi"), ("internet", "wifi"), ("otopark", "parkingsign"), ("restoran", "fork.knife"),
            ("bar", "wineglass"), ("kahvalt", "cup.and.saucer"), ("çocuk", "figure.and.child.holdinghands"),
            ("oyun", "gamecontroller"), ("asansör", "arrow.up.arrow.down"), ("plaj", "beach.umbrella"),
            ("kayak", "figure.skiing.downhill"), ("toplantı", "person.3"), ("evcil", "pawprint"),
            ("klima", "snowflake"), ("transfer", "bus"), ("engelli", "figure.roll"), ("bahçe", "leaf"),
        ]
        return table.first { key.contains($0.0) }?.1 ?? "checkmark.circle"
    }
}

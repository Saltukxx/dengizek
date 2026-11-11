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

    /// Geniş ekranda (iPad) içerik okunabilir genişlikte ortalanır; telefonda etkisiz.
    func readableWidth(_ width: CGFloat = 760) -> some View {
        frame(maxWidth: width).frame(maxWidth: .infinity)
    }
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

/// Gezinme çubuğu başlığı marka yazı tipiyle (sistem büyük başlığı yerine);
/// otel sayfası, Ara ve Kaydedilenler aynı başlığı kullanır.
struct BrandedNavigationTitle: ViewModifier {
    @Environment(\.theme) private var theme
    let title: String

    func body(content: Content) -> some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(theme.headerBackground, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(title)
                        .font(theme.body(16, weight: 700, style: .headline))
                        .foregroundStyle(theme.text)
                        .lineLimit(1)
                }
            }
    }
}

extension View {
    func brandedNavigationTitle(_ title: String) -> some View { modifier(BrandedNavigationTitle(title: title)) }
}

/// Kart ve satırlar parmağın altında hafifçe küçülür (gerçek basma hissi).
/// Gezinme bağlantılarında kullanılır; dokunuş yine bağlantıya gider.
struct PressScaleButtonStyle: ButtonStyle {
    var scale: CGFloat = 0.97

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == PressScaleButtonStyle {
    static var pressScale: PressScaleButtonStyle { PressScaleButtonStyle() }
    /// Geniş satırlar için daha az küçülme.
    static var pressScaleRow: PressScaleButtonStyle { PressScaleButtonStyle(scale: 0.985) }
}

/// Liste öğeleri ekrana sırayla, hafifçe yükselerek girer. "Hareketi azalt"
/// açıksa yalnız saydamlık değişir.
struct StaggeredEntrance: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let index: Int
    let appeared: Bool

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared || reduceMotion ? 0 : 14)
            .animation(.spring(response: 0.5, dampingFraction: 0.82).delay(0.06 + Double(min(index, 8)) * 0.06), value: appeared)
    }
}

extension View {
    func staggeredEntrance(index: Int, appeared: Bool) -> some View {
        modifier(StaggeredEntrance(index: index, appeared: appeared))
    }
}

/// Tutar değişince (tarih değişince fiyat) yalnız rakamlar yuvarlanır; para
/// birimi işareti yerinde durur, rakamlarla birlikte dönünce titriyordu.
/// "Hareketi azalt" açıksa yaylanma yok, kısa bir geçiş.
struct RollingAmount: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let minor: Int
    let currency: String

    var body: some View {
        let text = Formatting.amount(minor, currency: currency)
        let parts = Self.split(text)
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text(parts.prefix)
            Text(parts.number)
                .contentTransition(.numericText(value: Double(minor)))
            Text(parts.suffix)
        }
        .animation(reduceMotion ? .easeInOut(duration: 0.2) : .spring(response: 0.4, dampingFraction: 0.65), value: minor)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    /// "₺52.500" → ("₺", "52.500", ""); işaret sonda da olabilir ("52.500 €").
    static func split(_ text: String) -> (prefix: String, number: String, suffix: String) {
        guard let first = text.firstIndex(where: \.isNumber), let last = text.lastIndex(where: \.isNumber) else {
            return ("", text, "")
        }
        return (String(text[..<first]), String(text[first...last]), String(text[text.index(after: last)...]))
    }
}

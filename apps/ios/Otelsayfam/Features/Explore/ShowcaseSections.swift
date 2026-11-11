import SwiftUI

// Web ana sayfasındaki tanıtım bölümleri (showcase-intro.tsx, ai-steps.tsx):
// "Otelsayfam neden farklı?" ve "Yapay zekâyı nerede kullanıyoruz?".
// Metinler web'le aynı. Uygulamada olmayan özellik anlatılmaz: arama adımı
// (uygulama araması yapay zekâlı değil) ve İngilizce sesli soru yok.

/// Klasik otel sitesi ↔ Otelsayfam karşılaştırması.
struct ShowcaseCompareSection: View {
    @Environment(\.theme) private var theme

    private let rows: [(classic: String, classicIcon: String, ours: String, oursIcon: String)] = [
        (String(localized: "Fotoğraf galerisi"), "photo", String(localized: "Duraklı video tur"), "video.fill"),
        (String(localized: "Uzun broşür metni"), "doc.text", String(localized: "Soru sorun, cevap alın"), "bubble.left.fill"),
        (String(localized: "“Bilgi için arayın”"), "phone", String(localized: "Anında, kaynağı gösterilen cevap"), "checkmark.shield.fill"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Diğer siteler fotoğraf gösterir. Biz oteli gezdiririz.")
                .font(theme.display(26, style: .title2))
                .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) {
                HStack {
                    Text("Klasik otel sitesi").frame(maxWidth: .infinity, alignment: .leading)
                    Text("Otelsayfam").frame(maxWidth: .infinity, alignment: .leading)
                        .foregroundStyle(theme.isDark ? theme.sand : theme.primary)
                }
                .font(theme.body(12, weight: 700))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(theme.textDim)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .accessibilityHidden(true)
                ForEach(rows, id: \.classic) { row in
                    Divider().overlay(theme.line)
                    HStack(alignment: .top, spacing: 12) {
                        Label(row.classic, systemImage: row.classicIcon)
                            .font(theme.body(14))
                            .foregroundStyle(theme.textDim)
                            .labelStyle(CompareLabelStyle(accent: theme.textDim))
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Label(row.ours, systemImage: row.oursIcon)
                            .font(theme.body(14, weight: 700))
                            .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                            .labelStyle(CompareLabelStyle(accent: theme.isDark ? theme.sand : theme.primary))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Klasik site: \(row.classic). Otelsayfam: \(row.ours).")
                }
            }
            .cardSurface()
        }
    }
}

private struct CompareLabelStyle: LabelStyle {
    let accent: Color

    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            configuration.icon.foregroundStyle(accent).frame(width: 18)
            configuration.title
        }
    }
}

/// Yapay zekâ adımları: yana kaydırılan kartlar, her birinde küçük bir örnek.
struct ShowcaseAiSection: View {
    @Environment(\.theme) private var theme
    let season: Season
    @State private var page: Int? = 0

    private enum Step: Int, CaseIterable, Identifiable {
        case route, truth, voice
        var id: Int { rawValue }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Aramadan tura, her adımda yanınızda bir rehber")
                    .font(theme.display(26, style: .title2))
                    .foregroundStyle(theme.inkOnDeep)
                    .fixedSize(horizontal: false, vertical: true)
                Text("Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın.")
                    .font(theme.body(15))
                    .foregroundStyle(theme.mutedOnDeep)
                    .lineSpacing(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: 12) {
                    ForEach(Step.allCases) { step in
                        card(step)
                            .containerRelativeFrame(.horizontal) { width, _ in width - 56 }
                            .id(step.rawValue)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $page)
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, 20, for: .scrollContent)

            HStack(spacing: 8) {
                ForEach(Step.allCases) { step in
                    Capsule()
                        .fill(step.rawValue == (page ?? 0) ? theme.sand : theme.mutedOnDeep.opacity(0.4))
                        .frame(width: step.rawValue == (page ?? 0) ? 20 : 7, height: 7)
                }
            }
            .animation(.snappy, value: page)
            .frame(maxWidth: .infinity)
            .accessibilityHidden(true)
        }
        .padding(.vertical, 32)
        .background(DeepBackground())
    }

    @ViewBuilder private func card(_ step: Step) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            visual(step)
                .frame(maxWidth: .infinity, minHeight: 132, alignment: .topLeading)
                .padding(14)
                .background(theme.bg.opacity(theme.isDark ? 0.35 : 0.7), in: .rect(cornerRadius: theme.radiusMedium, style: .continuous))
            VStack(alignment: .leading, spacing: 6) {
                Label(title(step), systemImage: symbol(step))
                    .font(theme.body(17, weight: 700, style: .headline))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                Text(text(step))
                    .font(theme.body(14))
                    .foregroundStyle(theme.textMuted)
                    .lineSpacing(2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(theme.surface, in: .rect(cornerRadius: theme.radiusLarge, style: .continuous))
        .accessibilityElement(children: .combine)
    }

    private func title(_ step: Step) -> String {
        switch step {
        case .route: String(localized: "Turu sözle yönetin")
        case .truth: String(localized: "Uydurmayan cevaplar")
        case .voice: String(localized: "Sesli sorun")
        }
    }

    private func symbol(_ step: Step) -> String {
        switch step {
        case .route: "point.topright.arrow.triangle.backward.to.point.bottomleft.scurvepath"
        case .truth: "checkmark.shield"
        case .voice: "mic"
        }
    }

    private func text(_ step: Step) -> String {
        switch step {
        case .route:
            String(localized: "Video tur sırasında “\(season.followUp)” deyin; rehber sizi o durağa götürür. “Oteli gezdir” derseniz bütün durakları sırayla anlatır.")
        case .truth:
            String(localized: "Rehber yalnız otelin kendi girdiği bilgilerden cevap verir ve kaynağını kartla gösterir. Bilgi kayıtlı değilse tahmin etmez, sorunuzu ekibimize iletmenizi önerir.")
        case .voice:
            String(localized: "Yazmak istemezseniz mikrofona dokunun, sorunuzu söyleyin.")
        }
    }

    @ViewBuilder private func visual(_ step: Step) -> some View {
        switch step {
        case .route:
            VStack(alignment: .leading, spacing: 10) {
                Bubble(text: season.followUp, guest: true)
                HStack(spacing: 6) {
                    ForEach(Array(season.tourStops.enumerated()), id: \.offset) { index, stop in
                        Text(stop)
                            .font(theme.body(12, weight: index == 1 ? 700 : 500))
                            .lineLimit(1)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 5)
                            .foregroundStyle(index == 1 ? .white : theme.textDim)
                            .background(index == 1 ? theme.primary : theme.surface2, in: .capsule)
                    }
                }
                Bubble(text: season.followUpReply, guest: false)
            }
        case .truth:
            VStack(alignment: .leading, spacing: 10) {
                Bubble(text: String(localized: "Golf sahası var mı?"), guest: true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Bu konuda doğrulanmış bilgim yok.")
                        .font(theme.body(13))
                        .foregroundStyle(theme.text)
                    Text("Ekibimize sorun →")
                        .font(theme.body(13, weight: 700))
                        .foregroundStyle(theme.cta)
                }
                .padding(10)
                .background(theme.surface, in: .rect(cornerRadius: 12, style: .continuous))
            }
        case .voice:
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    Image(systemName: "mic.fill")
                        .font(.title3)
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(theme.cta, in: .circle)
                    Image(systemName: "waveform")
                        .font(.system(size: 30))
                        .foregroundStyle(theme.primary)
                        .symbolEffect(.variableColor.iterative, options: .repeating)
                }
                Text(season.voiceExample)
                    .font(theme.body(14, weight: 600))
                    .foregroundStyle(theme.text)
            }
        }
    }
}

private struct Bubble: View {
    @Environment(\.theme) private var theme
    let text: String
    let guest: Bool

    var body: some View {
        Text(text)
            .font(theme.body(13, weight: guest ? 600 : 400))
            .foregroundStyle(guest ? theme.onPrimary : theme.text)
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(guest ? theme.primary : theme.surface, in: .rect(cornerRadius: 12, style: .continuous))
            .frame(maxWidth: .infinity, alignment: guest ? .trailing : .leading)
    }
}

#Preview {
    ScrollView {
        VStack(alignment: .leading, spacing: 32) {
            ShowcaseCompareSection().padding(.horizontal, 16)
            ShowcaseAiSection(season: .termal)
        }
        .padding(.vertical, 16)
    }
    .background(Theme.termal.bg)
    .environment(\.theme, .termal)
}

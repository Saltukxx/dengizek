import SwiftUI

/// Boş ve hata ekranlarının ortak düzeni: marka yazı tipleri ve renkleri,
/// sistemin varsayılan mavisi ve yazı tipi yok.
struct StateMessageView<Actions: View>: View {
    @Environment(\.theme) private var theme
    /// Tur ekranı gibi temadan bağımsız siyah zeminler `.colorScheme(.dark)` verir.
    @Environment(\.colorScheme) private var colorScheme
    let symbol: String
    let title: String
    let message: String
    @ViewBuilder var actions: Actions

    var body: some View {
        let onDark = theme.isDark || colorScheme == .dark
        VStack(spacing: 14) {
            Image(systemName: symbol)
                .font(.system(size: 26, weight: .medium))
                .foregroundStyle(onDark ? theme.sand : theme.primary)
                .frame(width: 60, height: 60)
                .background(onDark ? Color.white.opacity(0.1) : theme.surface2, in: .circle)
                .accessibilityHidden(true)
            VStack(spacing: 6) {
                Text(title)
                    .font(theme.display(24, style: .title2))
                    .foregroundStyle(onDark ? Color.white : theme.navy)
                Text(message)
                    .font(theme.body(15))
                    .foregroundStyle(onDark ? Color.white.opacity(0.72) : theme.textDim)
                    .lineSpacing(2)
            }
            .multilineTextAlignment(.center)
            actions
                .padding(.top, 4)
        }
        .frame(maxWidth: 320)
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
    }
}

extension StateMessageView where Actions == EmptyView {
    init(symbol: String, title: String, message: String) {
        self.init(symbol: symbol, title: title, message: message) { EmptyView() }
    }
}

/// Yükleme hatası: türüne göre başlık ve simge değişir. Bulunamayan kayıtta
/// "Tekrar dene" anlamsız olduğu için gösterilmez.
struct ErrorStateView: View {
    /// Ne bulunamadı? Başlık tam cümle olarak çevrilir ("Tur bulunamadı").
    enum Subject {
        case page, hotel, tour

        var notFoundTitle: String {
            switch self {
            case .page: String(localized: "Sayfa bulunamadı")
            case .hotel: String(localized: "Otel bulunamadı")
            case .tour: String(localized: "Tur bulunamadı")
            }
        }
    }

    var subject = Subject.page
    let error: APIError
    let retry: () async -> Void

    private var message: String { error.errorDescription ?? "" }

    var body: some View {
        switch error {
        case .notFound:
            StateMessageView(
                symbol: "questionmark.square.dashed",
                title: subject.notFoundTitle,
                message: String(localized: "Yayından kaldırılmış ya da adresi değişmiş olabilir.")
            )
        case .unreachable:
            StateMessageView(symbol: "wifi.exclamationmark", title: String(localized: "Bağlantı yok"), message: message) { retryButton }
        case .server:
            StateMessageView(symbol: "exclamationmark.triangle", title: String(localized: "Yüklenemedi"), message: message) { retryButton }
        }
    }

    private var retryButton: some View {
        Button("Tekrar dene", systemImage: "arrow.clockwise") { Task { await retry() } }
            .buttonStyle(.otsOutline)
            .fixedSize()
    }
}

/// Bağlantı yokken son kaydedilen bilgiler gösteriliyor.
struct OfflineNotice: View {
    @Environment(\.theme) private var theme

    var body: some View {
        Label("Çevrimdışısınız. Son kaydedilen bilgiler gösteriliyor; fiyatlar değişmiş olabilir.", systemImage: "wifi.slash")
            .font(theme.body(13, weight: 600))
            .foregroundStyle(theme.textMuted)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.surface2, in: .rect(cornerRadius: theme.radius, style: .continuous))
            .accessibilityIdentifier("offline-notice")
    }
}

// MARK: İskeletler (yüklenirken sayfanın biçimi)

/// Soldan sağa geçen hafif parıltı. "Hareketi azalt" açıksa durağan.
private struct Shimmer: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var moving = false

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content
                .overlay {
                    GeometryReader { proxy in
                        LinearGradient(colors: [.clear, .white.opacity(0.35), .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: proxy.size.width * 0.6)
                            .offset(x: moving ? proxy.size.width : -proxy.size.width * 0.6)
                    }
                    .mask(content)
                    .allowsHitTesting(false)
                }
                .onAppear {
                    withAnimation(.linear(duration: 1.3).repeatForever(autoreverses: false)) { moving = true }
                }
        }
    }
}

/// İskelet parçası: yazı satırı ya da görsel yerine dolu blok.
struct SkeletonBlock: View {
    @Environment(\.theme) private var theme
    var width: CGFloat?
    var height: CGFloat = 14
    var radius: CGFloat = 6

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(theme.surface3)
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
    }
}

extension View {
    /// İskelet kapsayıcısı: parıltı, VoiceOver'a tek "Yükleniyor".
    func skeleton() -> some View {
        modifier(Shimmer())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Yükleniyor")
    }
}

/// `HotelCardView` biçiminde iskelet.
struct HotelCardSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Color.clear
                .aspectRatio(16 / 9, contentMode: .fit)
                .overlay { SkeletonBlock(height: .infinity, radius: 0) }
            VStack(alignment: .leading, spacing: 12) {
                SkeletonBlock(width: 220, height: 22)
                SkeletonBlock(width: 150)
                SkeletonBlock(width: 260)
                SkeletonBlock(width: 120, height: 24).padding(.top, 6)
            }
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 20)
        }
        .cardSurface()
    }
}

/// `HotelRow` biçiminde iskelet.
struct HotelRowSkeleton: View {
    @Environment(\.theme) private var theme

    var body: some View {
        HStack(spacing: 14) {
            SkeletonBlock(width: 76, height: 76, radius: theme.radius)
            VStack(alignment: .leading, spacing: 8) {
                SkeletonBlock(width: 180, height: 18)
                SkeletonBlock(width: 110)
                SkeletonBlock(width: 150, height: 12)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .cardSurface()
    }
}

/// Otel sayfası iskeleti: banner, galeri ve ilk bölümler.
struct HotelDetailSkeleton: View {
    @Environment(\.theme) private var theme

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                DeepBackground().frame(height: 190)
                Color.clear
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .overlay { SkeletonBlock(height: .infinity, radius: theme.radiusLarge) }
                    .padding(.horizontal, 16)
                    .readableWidth()
                    .padding(.top, -64)
                VStack(alignment: .leading, spacing: 14) {
                    SkeletonBlock(height: 50, radius: theme.radius)
                    SkeletonBlock(width: 140, height: 26).padding(.top, 18)
                    SkeletonBlock(height: 64, radius: theme.radiusMedium)
                    SkeletonBlock(width: 190, height: 26).padding(.top, 18)
                    SkeletonBlock()
                    SkeletonBlock()
                    SkeletonBlock(width: 240)
                }
                .padding(.horizontal, 16)
                .readableWidth()
                .padding(.top, 24)
            }
        }
        .scrollDisabled(true)
        .skeleton()
    }
}

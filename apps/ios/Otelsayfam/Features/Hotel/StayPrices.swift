import SwiftUI

/// Seçilen tarihlerin fiyat hesabı (otel ve oda sayfası).
enum QuoteState: Equatable {
    /// Tarih seçilmedi.
    case idle
    case loading
    case loaded(StayQuote)
    case failed(String)

    var quote: StayQuote? {
        if case .loaded(let quote) = self { quote } else { nil }
    }
}

extension APIClient {
    /// Tarih yoksa hesap yapılmaz; hata mesajı misafire gösterilir.
    func quoteState(hotelSlug: String, stay: StaySearch) async -> QuoteState? {
        guard stay.hasDates else { return .idle }
        do {
            return .loaded(try await quote(hotelSlug: hotelSlug, stay: stay))
        } catch is CancellationError {
            return nil
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}

/// Bir odanın seçilen tarihlerdeki toplam fiyatı ve uyarıları.
struct RoomQuotePrice: View {
    @Environment(\.theme) private var theme
    let quote: RoomQuote
    let nights: Int
    var compact = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let reason = quote.unavailable {
                Label(reason, systemImage: "calendar.badge.exclamationmark")
                    .font(theme.body(14, weight: 600))
                    .foregroundStyle(theme.cta)
            } else if let minStay = quote.minStayNights {
                Label("Bu tarihlerde en az \(minStay) gece konaklama gerekiyor.", systemImage: "moon.zzz")
                    .font(theme.body(14, weight: 600))
                    .foregroundStyle(theme.cta)
            } else if let total = quote.totalMinor {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    RollingAmount(minor: total, currency: quote.currency)
                        .font(theme.display(compact ? 20 : 24, style: .title3))
                        .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                    if let original = quote.originalTotalMinor, original > total {
                        Text(Formatting.amount(original, currency: quote.currency))
                            .font(theme.body(14))
                            .strikethrough()
                            .foregroundStyle(theme.textDim)
                            // VoiceOver üstü çizgiyi okumaz; iki fiyat yan yana karışmasın.
                            .accessibilityLabel("İndirimden önce \(Formatting.amount(original, currency: quote.currency))")
                    }
                }
                Text(perNightText(total))
                    .font(theme.body(13))
                    .foregroundStyle(theme.textDim)
                if let label = quote.discountLabel {
                    Text("Kampanya: \(label)")
                        .font(theme.body(12, weight: 700))
                        .foregroundStyle(theme.cta)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(theme.ctaTint, in: .capsule)
                }
            } else {
                Label("Fiyat talep üzerine", systemImage: "envelope")
                    .font(theme.body(14, weight: 600))
                    .foregroundStyle(theme.textMuted)
            }
            if quote.fit == .confirm {
                Text("Çocuk kapasitesi ekibimizce teyit edilir.")
                    .font(theme.body(12))
                    .foregroundStyle(theme.textDim)
            }
        }
    }

    private func perNightText(_ total: Int) -> String {
        let average = Formatting.amount(total / max(nights, 1), currency: quote.currency)
        // Çeviride sözcük sırası değişebildiği için iki ayrı tam cümle.
        if quote.freeNights > 0 {
            return String(localized: "\(nights) gece toplam (\(quote.freeNights) gecesi ücretsiz) · ort. \(average) / gece")
        }
        return String(localized: "\(nights) gece toplam · ort. \(average) / gece")
    }
}

/// Otel sayfasındaki "Fiyatlar" bölümü: seçili tarih/kişi ve oda oda toplam.
struct StayPriceSection: View {
    @Environment(\.theme) private var theme
    let hotel: HotelDetail
    let stay: StaySearch
    let state: QuoteState
    let onEdit: () -> Void
    let onRetry: () async -> Void
    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            StaySummaryButton(stay: stay, action: onEdit)
            switch state {
            case .idle:
                hint(String(localized: "Giriş ve çıkış tarihi seçince oda oda toplam fiyat burada görünür."), symbol: "info.circle")
            case .loading:
                ProgressView("Fiyatlar hesaplanıyor…")
                    .font(theme.body(14))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 20)
            case .failed(let message):
                VStack(alignment: .leading, spacing: 10) {
                    hint(message, symbol: "exclamationmark.triangle")
                    Button("Tekrar dene", systemImage: "arrow.clockwise") { Task { await onRetry() } }
                        .buttonStyle(.otsOutline)
                        .fixedSize()
                }
            case .loaded(let quote):
                rooms(quote)
            }
        }
    }

    @ViewBuilder private func rooms(_ quote: StayQuote) -> some View {
        let visible = quote.visibleRooms
        if quote.rooms.isEmpty {
            hint(String(localized: "Bu otelin oda fiyatları henüz girilmemiş. Talep gönderin, ekibimiz fiyatı size bildirsin."), symbol: "envelope")
        } else if visible.isEmpty {
            hint(String(localized: "Seçtiğiniz kişi sayısını alan oda yok. Kişi sayısını değiştirin ya da talep gönderin."), symbol: "person.2.slash")
        } else {
            VStack(spacing: 0) {
                ForEach(Array(visible.enumerated()), id: \.element.id) { index, roomQuote in
                    VStack(spacing: 0) {
                        if index > 0 { Divider().overlay(theme.line) }
                        row(roomQuote, nights: quote.nights)
                    }
                    .staggeredEntrance(index: index, appeared: appeared)
                }
            }
            .cardSurface()
            .onAppear { appeared = true }
            .onDisappear { appeared = false }
            Text("Şu anda ücret alınmaz. Fiyatı ve müsaitliği ekibimiz talebinize dönerken teyit eder.")
                .font(theme.body(13))
                .foregroundStyle(theme.textDim)
        }
    }

    @ViewBuilder private func row(_ quote: RoomQuote, nights: Int) -> some View {
        let content = HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(quote.name)
                        .font(theme.body(16, weight: 700))
                        .foregroundStyle(theme.text)
                        .multilineTextAlignment(.leading)
                    if let board = quote.boardLabel {
                        Text(board)
                            .font(theme.body(13, weight: 600))
                            .foregroundStyle(theme.primary)
                    }
                }
                RoomQuotePrice(quote: quote, nights: nights, compact: true)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(theme.textDim)
                .padding(.top, 4)
                .accessibilityHidden(true)
        }
        .padding(16)
        .contentShape(.rect)

        if let room = hotel.rooms.first(where: { $0.slug == quote.slug }) {
            NavigationLink(value: RoomRoute(hotel: hotel, room: room)) { content }
                .buttonStyle(.pressScaleRow)
                .accessibilityIdentifier("quote-room-\(quote.slug)")
        } else {
            content
        }
    }

    private func hint(_ text: String, symbol: String) -> some View {
        Label(text, systemImage: symbol)
            .font(theme.body(14))
            .foregroundStyle(theme.textMuted)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.surface2, in: .rect(cornerRadius: theme.radiusMedium, style: .continuous))
    }
}

/// Oda sayfasına gezinme hedefi.
struct RoomRoute: Hashable {
    let hotel: HotelDetail
    let room: Room
}

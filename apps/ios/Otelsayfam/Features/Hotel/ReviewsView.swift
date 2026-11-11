import SwiftUI

/// Otel sayfasındaki "Misafir yorumları": ortalama, en yeni üç yorum ve tümü.
struct ReviewsSection: View {
    @Environment(\.theme) private var theme
    let reviews: ReviewSummary
    @State private var showsAll = false

    /// Sayfada gösterilen yorum sayısı; kalanı "tümünü gör" sayfasında.
    private static let previewCount = 3

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ReviewScoreLine(reviews: reviews)
            ForEach(reviews.items.prefix(Self.previewCount)) { review in
                ReviewCard(review: review)
            }
            if reviews.items.count > Self.previewCount {
                Button("Yorumların tümünü gör") { showsAll = true }
                    .buttonStyle(.otsOutline)
                    .accessibilityIdentifier("hotel.reviews.all")
            }
        }
        .sheet(isPresented: $showsAll) {
            ReviewListSheet(reviews: reviews)
                .environment(\.theme, theme)
        }
    }
}

/// "4,8 ★★★★★ 12 yorum"
struct ReviewScoreLine: View {
    @Environment(\.theme) private var theme
    let reviews: ReviewSummary

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            if let average = reviews.average {
                Text(Formatting.rating(average))
                    .font(theme.display(34, style: .largeTitle))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
                StarRow(rating: Int(average.rounded()))
            }
            Text(String(localized: "\(reviews.count) yorum"))
                .font(theme.body(15))
                .foregroundStyle(theme.textDim)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(reviews.average.map { String(localized: "5 üzerinden \(Formatting.rating($0)), \(reviews.count) yorum") } ?? "\(reviews.count) yorum")
    }
}

private struct StarRow: View {
    @Environment(\.theme) private var theme
    let rating: Int

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { star in
                Image(systemName: star <= rating ? "star.fill" : "star")
            }
        }
        .font(.footnote)
        .foregroundStyle(theme.isDark ? theme.sand : theme.cta)
        .accessibilityElement()
        .accessibilityLabel("5 üzerinden \(rating)")
    }
}

private struct ReviewCard: View {
    @Environment(\.theme) private var theme
    let review: Review

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(review.guestName)
                    .font(theme.body(15, weight: 700))
                    .foregroundStyle(theme.text)
                Spacer(minLength: 8)
                StarRow(rating: review.rating)
            }
            if let when = review.stayText {
                Text(when)
                    .font(theme.body(13))
                    .foregroundStyle(theme.textDim)
            }
            if let title = review.title, !title.isEmpty {
                Text(title)
                    .font(theme.display(18, style: .headline))
                    .foregroundStyle(theme.isDark ? theme.text : theme.navy)
            }
            Text(review.body)
                .font(theme.body(15))
                .foregroundStyle(theme.textMuted)
                .lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
            if let reply = review.reply, !reply.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Otelin yanıtı")
                        .font(theme.body(13, weight: 700))
                        .foregroundStyle(theme.isDark ? theme.sand : theme.primary)
                    Text(reply)
                        .font(theme.body(14))
                        .foregroundStyle(theme.textMuted)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(theme.surface2, in: .rect(cornerRadius: theme.radius, style: .continuous))
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardSurface()
        .accessibilityElement(children: .combine)
    }
}

private struct ReviewListSheet: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    let reviews: ReviewSummary

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    ReviewScoreLine(reviews: reviews)
                    ForEach(reviews.items) { review in
                        ReviewCard(review: review)
                    }
                    // Sunucu en yeni yorumları gönderir; kalanı olduğunu gizlemeyelim.
                    if reviews.count > reviews.items.count {
                        Text("En yeni \(reviews.items.count) yorum gösteriliyor.")
                            .font(theme.body(13))
                            .foregroundStyle(theme.textDim)
                    }
                }
                .padding(16)
            }
            .background(theme.bg)
            .navigationTitle("Misafir yorumları")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Kapat") { dismiss() } }
            }
        }
    }
}

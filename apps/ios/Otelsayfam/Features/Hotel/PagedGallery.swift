import SwiftUI

/// Galerideki tek fotoğraf.
struct GalleryPhoto: Hashable, Identifiable, Sendable {
    let index: Int
    let url: String
    let caption: String?
    var id: Int { index }
}

/// Sayfalı fotoğraf şeridi (otel ve oda sayfası): sayaç, dokununca tam ekran.
struct PagedGallery: View {
    @Environment(\.theme) private var theme
    let photos: [GalleryPhoto]
    /// VoiceOver için: "Oruçoğlu Thermal Hotel fotoğrafları".
    let label: String
    var cornerRadius: CGFloat = 0

    @State private var index = 0
    @State private var showsViewer = false
    @Namespace private var zoom

    init(urls: [String], captions: [String?] = [], label: String, cornerRadius: CGFloat = 0) {
        photos = urls.enumerated().map { offset, url in
            GalleryPhoto(index: offset, url: url, caption: offset < captions.count ? captions[offset] : nil)
        }
        self.label = label
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        TabView(selection: $index) {
            ForEach(photos) { photo in
                Button { showsViewer = true } label: {
                    Color.clear
                        .overlay { RemoteImage(path: photo.url) }
                        .clipped()
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(photo.caption ?? String(localized: "Fotoğraf \(photo.index + 1) / \(photos.count)"))
                .accessibilityHint("Tam ekran açar")
                .tag(photo.index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .aspectRatio(4 / 3, contentMode: .fit)
        .clipShape(.rect(cornerRadius: cornerRadius, style: .continuous))
        .overlay(alignment: .bottomTrailing) {
            if photos.count > 1 { GalleryCounter(index: index, count: photos.count).padding(12) }
        }
        .matchedTransitionSource(id: "gallery", in: zoom)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
        .accessibilityIdentifier("gallery")
        .fullScreenCover(isPresented: $showsViewer) {
            GalleryViewer(photos: photos, index: $index)
                .navigationTransition(.zoom(sourceID: "gallery", in: zoom))
        }
    }
}

/// "3 / 12"
struct GalleryCounter: View {
    @Environment(\.theme) private var theme
    let index: Int
    let count: Int

    var body: some View {
        Text("\(index + 1) / \(count)")
            .contentTransition(.numericText(value: Double(index)))
            .animation(.snappy, value: index)
            .font(theme.body(14, weight: 600).monospacedDigit())
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.black.opacity(0.55), in: .capsule)
            .accessibilityHidden(true)
    }
}

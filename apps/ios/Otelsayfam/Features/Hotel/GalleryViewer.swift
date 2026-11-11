import SwiftUI

/// Tam ekran fotoğraf görüntüleyici: sayfalı geçiş, iki parmakla ve çift
/// dokunuşla yakınlaştırma, başlık. Galeri hangi fotoğrafta kaldıysa oradan
/// açılır; kapanınca galeri de son bakılan fotoğrafta kalır.
struct GalleryViewer: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.theme) private var theme
    let photos: [GalleryPhoto]
    @Binding var index: Int

    private var current: GalleryPhoto? { photos.indices.contains(index) ? photos[index] : nil }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            TabView(selection: $index) {
                ForEach(photos) { photo in
                    ZoomablePhoto(path: photo.url, isActive: photo.index == index)
                        .accessibilityLabel(photo.caption ?? String(localized: "Fotoğraf \(photo.index + 1) / \(photos.count)"))
                        .tag(photo.index)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()
        }
        .overlay(alignment: .top) { topBar }
        .overlay(alignment: .bottom) { caption }
        .environment(\.colorScheme, .dark)
        .statusBarHidden()
    }

    private var topBar: some View {
        HStack {
            Button("Kapat", systemImage: "xmark") { dismiss() }
                .labelStyle(.iconOnly)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.black.opacity(0.55), in: .circle)
                .accessibilityIdentifier("gallery.close")
            Spacer()
            if photos.count > 1 { GalleryCounter(index: index, count: photos.count) }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    @ViewBuilder private var caption: some View {
        if let text = current?.caption, !text.isEmpty {
            Text(text)
                .font(theme.body(15))
                .foregroundStyle(.white)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity)
                .background(.black.opacity(0.55))
                .accessibilityHidden(true)
        }
    }
}

/// Yakınlaştırılabilen fotoğraf. Yakınlaştırılmamışken yatay kaydırma sayfa
/// değiştirir; yakınlaştırılınca parmak fotoğrafı gezdirir.
private struct ZoomablePhoto: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let path: String
    let isActive: Bool

    @State private var scale: CGFloat = 1
    @State private var settledScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var settledOffset: CGSize = .zero

    private static let maxScale: CGFloat = 4
    private static let doubleTapScale: CGFloat = 2.5

    var body: some View {
        GeometryReader { proxy in
            RemoteImage(path: path, contentMode: .fit)
                .frame(width: proxy.size.width, height: proxy.size.height)
                .scaleEffect(scale)
                .offset(offset)
                .contentShape(.rect)
                .gesture(magnify(in: proxy.size))
                .highPriorityGesture(pan(in: proxy.size), isEnabled: scale > 1)
                .onTapGesture(count: 2) {
                    withAnimation(reduceMotion ? nil : .snappy) {
                        if scale > 1 { reset() } else { set(scale: Self.doubleTapScale, offset: .zero, in: proxy.size) }
                    }
                }
        }
        // Başka fotoğrafa geçilince yakınlaştırma sıfırlanır.
        .onChange(of: isActive) { _, active in
            if !active { reset() }
        }
    }

    private func magnify(in size: CGSize) -> some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = min(max(settledScale * value.magnification, 1), Self.maxScale)
                offset = Self.clamp(settledOffset, scale: scale, in: size)
            }
            .onEnded { _ in
                if scale <= 1.02 {
                    withAnimation(reduceMotion ? nil : .snappy) { reset() }
                } else {
                    settledScale = scale
                    settledOffset = offset
                }
            }
    }

    private func pan(in size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                let moved = CGSize(width: settledOffset.width + value.translation.width, height: settledOffset.height + value.translation.height)
                offset = Self.clamp(moved, scale: scale, in: size)
            }
            .onEnded { _ in settledOffset = offset }
    }

    private func set(scale newScale: CGFloat, offset newOffset: CGSize, in size: CGSize) {
        scale = newScale
        settledScale = newScale
        offset = Self.clamp(newOffset, scale: newScale, in: size)
        settledOffset = offset
    }

    private func reset() {
        scale = 1
        settledScale = 1
        offset = .zero
        settledOffset = .zero
    }

    /// Fotoğraf ekran dışına taşınamaz: kaydırma, büyütmenin açtığı pay kadardır.
    static func clamp(_ offset: CGSize, scale: CGFloat, in size: CGSize) -> CGSize {
        let maxX = max(0, size.width * (scale - 1) / 2)
        let maxY = max(0, size.height * (scale - 1) / 2)
        return CGSize(width: min(max(offset.width, -maxX), maxX), height: min(max(offset.height, -maxY), maxY))
    }
}

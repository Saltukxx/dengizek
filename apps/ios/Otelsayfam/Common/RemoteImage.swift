import SwiftUI

/// Sunucudan gelen (göreli olabilen) görsel yolu; yüklenene kadar sakin bir zemin.
/// Görsel, ekranda kapladığı boyuta küçültülür ve önbelleğe alınır (`ImagePipeline`).
struct RemoteImage: View {
    @Environment(\.api) private var api
    @Environment(\.displayScale) private var displayScale
    let path: String?
    /// `.fill`: kart ve şeritlerde alanı doldurur. `.fit`: tam ekranda fotoğrafın tamamı görünür.
    var contentMode: ContentMode = .fill

    @State private var side: CGFloat = 0
    @State private var phase: Phase = .empty

    private enum Phase {
        case empty
        case loaded(UIImage)
        case failed

        var isLoaded: Bool {
            if case .loaded = self { true } else { false }
        }
    }

    private struct LoadKey: Equatable {
        let url: URL?
        let maxPixel: CGFloat
    }

    private var key: LoadKey {
        // Tam ekranda yakınlaştırma payı: iki kat çözünürlük.
        let points = contentMode == .fit ? side * 2 : side
        return LoadKey(url: api.resolve(path), maxPixel: side > 0 ? ImagePipeline.bucket(points: points, scale: displayScale) : 0)
    }

    var body: some View {
        Group {
            switch phase {
            case .loaded(let image):
                Image(uiImage: image).resizable().aspectRatio(contentMode: contentMode)
            case .failed:
                placeholder.overlay {
                    Image(systemName: "photo").foregroundStyle(.tertiary)
                }
            case .empty:
                placeholder.overlay {
                    if contentMode == .fit { ProgressView() }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onGeometryChange(for: CGFloat.self) { max($0.size.width, $0.size.height) } action: { side = $0 }
        .task(id: key) { await load(key) }
        .accessibilityHidden(true)
    }

    private func load(_ key: LoadKey) async {
        guard let url = key.url else {
            phase = .failed
            return
        }
        // Boyut ölçülmeden yükleme yapılmaz (hangi çözünürlük gerektiği bilinmiyor).
        guard key.maxPixel > 0 else { return }
        if let hit = ImagePipeline.shared.cached(url, maxPixel: key.maxPixel) {
            phase = .loaded(hit)
            return
        }
        do {
            let image = try await ImagePipeline.shared.image(for: url, maxPixel: key.maxPixel)
            guard !Task.isCancelled else { return }
            withAnimation(.easeOut(duration: 0.2)) { phase = .loaded(image) }
        } catch {
            // Daha büyük boy yüklenemediyse eldeki görsel kalır.
            if !Task.isCancelled, !phase.isLoaded { phase = .failed }
        }
    }

    @ViewBuilder private var placeholder: some View {
        // Tam ekranda (siyah zemin) gri kutu yerine boşluk.
        if contentMode == .fit { Color.clear } else { Rectangle().fill(.quaternary) }
    }
}

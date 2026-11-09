import SwiftUI

/// Sunucudan gelen (göreli olabilen) görsel yolu; yüklenene kadar sakin bir zemin.
struct RemoteImage: View {
    @Environment(\.api) private var api
    let path: String?

    var body: some View {
        AsyncImage(url: api.resolve(path), transaction: Transaction(animation: .easeOut(duration: 0.2))) { phase in
            switch phase {
            case .success(let image):
                image.resizable().scaledToFill()
            case .failure:
                placeholder.overlay {
                    Image(systemName: "photo").foregroundStyle(.tertiary)
                }
            default:
                placeholder
            }
        }
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        Rectangle().fill(.quaternary)
    }
}

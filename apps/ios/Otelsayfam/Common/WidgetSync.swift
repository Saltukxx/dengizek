import Foundation
import UIKit
import WidgetKit

/// Kaydedilen otelleri ana ekran widget'ının okuyacağı ortak klasöre yazar:
/// özet (ad, şehir) ve küçültülmüş kapak görselleri. Ortak klasör yoksa
/// (imza profilinde App Group yetkisi yok) hiçbir şey yapmaz.
enum WidgetSync {
    /// Testlerde ortak klasöre yazılmaz.
    static let isEnabled = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil && !DebugLaunch.resetsState

    /// `hotels`: en yeni kaydedilen üstte.
    static func update(with hotels: [HotelSummary], api: APIClient = .live) {
        guard isEnabled, let directory = SharedContainer.url else { return }
        let snapshot = WidgetSnapshot(
            apiBaseURL: api.baseURL,
            hotels: hotels.map { WidgetSnapshot.Hotel(slug: $0.slug, name: $0.name, city: $0.city) }
        )
        let images = hotels.prefix(WidgetSnapshot.visibleLimit).map { (slug: $0.slug, url: api.resolve($0.imageUrl)) }
        Task.detached(priority: .utility) {
            try? snapshot.save(to: directory)
            for image in images {
                let file = WidgetSnapshot.imageFile(slug: image.slug, in: directory)
                guard !FileManager.default.fileExists(atPath: file.path()), let url = image.url,
                      let picture = try? await ImagePipeline.shared.image(for: url, maxPixel: 640),
                      let data = picture.jpegData(compressionQuality: 0.8) else { continue }
                try? data.write(to: file, options: .atomic)
            }
            WidgetCenter.shared.reloadTimelines(ofKind: WidgetSnapshot.kind)
        }
    }
}

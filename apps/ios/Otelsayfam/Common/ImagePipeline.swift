import ImageIO
import UIKit

/// Görsel yükleme hattı: disk önbelleği (aynı görsel yeniden indirilmez),
/// gösterileceği boyuta küçültme (bellek) ve küçültülmüş hâlin bellek önbelleği
/// (listede geri kaydırınca anında görünür).
///
/// `@unchecked Sendable`: `NSCache` iş parçacığı güvenlidir, diğer alanlar değişmez.
final class ImagePipeline: @unchecked Sendable {
    static let shared = ImagePipeline()

    /// Görselin uzun kenarı bu basamaklardan birine küçültülür; yakın boyutlar
    /// aynı önbellek kaydını paylaşır.
    static let buckets: [CGFloat] = [320, 640, 960, 1440, 2160, 3240]

    private let memory = NSCache<NSString, UIImage>()
    private let session: URLSession

    init(session: URLSession? = nil) {
        memory.totalCostLimit = 96 * 1024 * 1024
        if let session {
            self.session = session
        } else {
            let configuration = URLSessionConfiguration.default
            configuration.urlCache = URLCache(memoryCapacity: 8 * 1024 * 1024, diskCapacity: 256 * 1024 * 1024, directory: nil)
            self.session = URLSession(configuration: configuration)
        }
    }

    /// Ekranda `points` genişliğinde gösterilecek görsel için piksel basamağı.
    static func bucket(points: CGFloat, scale: CGFloat) -> CGFloat {
        let pixels = points * scale
        return buckets.first { $0 >= pixels } ?? buckets[buckets.count - 1]
    }

    /// Bellekteki hazır görsel (ağ ve disk yok); listede geri dönüşte titreme olmasın.
    func cached(_ url: URL, maxPixel: CGFloat) -> UIImage? {
        memory.object(forKey: Self.key(url, maxPixel))
    }

    func image(for url: URL, maxPixel: CGFloat) async throws -> UIImage {
        if let hit = cached(url, maxPixel: maxPixel) { return hit }
        let (data, response) = try await session.data(from: url)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        guard let image = Self.downsample(data, maxPixel: maxPixel) else { throw URLError(.cannotDecodeContentData) }
        let cost = Int(image.size.width * image.scale * image.size.height * image.scale * 4)
        memory.setObject(image, forKey: Self.key(url, maxPixel), cost: cost)
        return image
    }

    /// Dosyayı tam boy açmadan, uzun kenarı en çok `maxPixel` olacak şekilde çözer.
    /// Küçük görsel büyütülmez.
    static func downsample(_ data: Data, maxPixel: CGFloat) -> UIImage? {
        let sourceOptions = [kCGImageSourceShouldCache: false] as CFDictionary
        guard let source = CGImageSourceCreateWithData(data as CFData, sourceOptions) else { return nil }
        let options = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
        ] as CFDictionary
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options) else { return nil }
        return UIImage(cgImage: cgImage)
    }

    private static func key(_ url: URL, _ maxPixel: CGFloat) -> NSString {
        "\(Int(maxPixel))|\(url.absoluteString)" as NSString
    }
}

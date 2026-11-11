import Foundation

/// Talep yazışması (`/api/v1/inquiries/portal/{token}/messages`).
struct InquiryThread: Decodable, Sendable, Equatable {
    struct Info: Decodable, Sendable, Equatable {
        let id: String
        let status: String

        /// Kapatılan talebe yeni mesaj yazılamaz.
        var isClosed: Bool { status == "kapatildi" }
    }

    let inquiry: Info
    let messages: [InquiryMessage]

    /// Misafirin yazmadığı mesajlar: "yeni cevap" bu sayının artmasından anlaşılır.
    var replyCount: Int { messages.count(where: { !$0.isOwn }) }
}

struct InquiryMessage: Decodable, Sendable, Equatable, Identifiable {
    let id: String
    let senderRole: String
    let senderName: String?
    let body: String
    let createdAt: Date
    /// Misafirin mesajı ekibimiz onaylayana kadar "bekliyor" kalır.
    let approvalStatus: String?

    var isOwn: Bool { senderRole == "guest" }
    var isPending: Bool { isOwn && approvalStatus == "bekliyor" }

    private enum CodingKeys: String, CodingKey { case id, senderRole, senderName, body, createdAt, approvalStatus }

    init(id: String, senderRole: String, senderName: String? = nil, body: String, createdAt: Date, approvalStatus: String? = nil) {
        self.id = id
        self.senderRole = senderRole
        self.senderName = senderName
        self.body = body
        self.createdAt = createdAt
        self.approvalStatus = approvalStatus
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        senderRole = try container.decode(String.self, forKey: .senderRole)
        senderName = try container.decodeIfPresent(String.self, forKey: .senderName)
        body = try container.decode(String.self, forKey: .body)
        approvalStatus = try container.decodeIfPresent(String.self, forKey: .approvalStatus)
        // Sunucu "2026-11-11T12:34:56.789Z" yazar; kesirsiz biçim de kabul edilir.
        let raw = try container.decode(String.self, forKey: .createdAt)
        guard let date = (try? Date(raw, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(raw, strategy: .iso8601)) else {
            throw DecodingError.dataCorruptedError(forKey: .createdAt, in: container, debugDescription: "Tarih okunamadı: \(raw)")
        }
        createdAt = date
    }
}

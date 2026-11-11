import Testing
@testable import Otelsayfam

/// Web'deki speech-text.test.ts ile aynı beklentiler.
struct SpeechTextTests {
    @Test func currencyAndHoursAreSpeakable() {
        #expect(SpeechText.prepare("Gecelik ₺8.200, giriş 14:00.") == "Gecelik 8.200 lira, giriş 14.")
        #expect(SpeechText.prepare("Fiyat 5.400 TL") == "Fiyat 5.400 lira")
        #expect(SpeechText.prepare("Kahvaltı 07:30") == "Kahvaltı 7 30")
    }

    @Test func stripsMarkdownLinksAndEmoji() {
        #expect(SpeechText.prepare("**Havuz** açık 🏊 [detay](https://x.com)") == "Havuz açık detay")
        #expect(SpeechText.prepare("2-4 kişi") == "2 ila 4 kişi")
    }

    @Test func takesOnlyFinishedSentencesWhileStreaming() {
        let partial = SpeechText.takeSentences("Havuz açık. Saat 12.", final: false)
        #expect(partial.ready == ["Havuz açık."])
        #expect(partial.consumed == 11)
        let final = SpeechText.takeSentences("Havuz açık. Saat 12.", final: true)
        #expect(final.ready == ["Havuz açık.", "Saat 12."])
    }

    @Test func doesNotSplitThousandsSeparator() {
        #expect(SpeechText.takeSentences("Toplam 12.500 lira", final: false).ready.isEmpty)
    }

    @Test func splitsVeryLongSentences() {
        let long = Array(repeating: "kelime", count: 80).joined(separator: " ")
        let parts = SpeechText.splitLong(long)
        #expect(parts.count > 1)
        #expect(parts.allSatisfy { $0.count <= SpeechText.maxChars })
    }
}

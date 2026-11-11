import Foundation

/// Rehber cevabını seslendirmeye hazırlar — web'deki `lib/voice/speech-text.ts`
/// ile aynı kurallar (Piper "TL"yi "te le", "14:00"ı "on dört sıfır sıfır" okur).
enum SpeechText {
    /// Tek seslendirme isteğindeki en uzun parça (sunucu sınırı 400).
    static let maxChars = 300

    static func prepare(_ text: String) -> String {
        var out = text
        // Bağlantılar okunmaz; markdown bağlantısında yalnız yazı kalır.
        out = replace(out, #"\[([^\]]+)\]\([^)]*\)"#, "$1")
        out = replace(out, #"\bhttps?://\S+"#, "", caseInsensitive: true)
        out = replace(out, #"\bwww\.\S+"#, "", caseInsensitive: true)
        // Markdown işaretleri ve emojiler.
        out = replace(out, #"\*\*|__|`+"#, "")
        out = replace(out, #"(^|\s)\*(?=\S)|(?<=\S)\*(?=\s|$)"#, "$1")
        out = replace(out, #"(?m)^\s*#{1,6}\s+"#, "")
        out = replace(out, #"(?m)^\s*[-*•]\s+"#, "")
        out = replace(out, #"\p{Extended_Pictographic}\x{FE0F}?"#, "")
        // Para birimi: "₺12.500" / "12.500 ₺" → "12.500 lira"; "TL" → "lira".
        for (symbol, word) in [("₺", "lira"), ("€", "avro"), ("\\$", "dolar")] {
            out = replace(out, "\(symbol)\\s?(\\d(?:[\\d.,]*\\d)?)", "$1 \(word)")
            out = replace(out, "\\s?\(symbol)", " \(word)")
        }
        out = replace(out, #"\bTL\b"#, "lira")
        // Saat: "14:00" → "14", "09:30" → "9 30".
        out = replaceHours(out)
        // Aralık: "2-4 kişi" → "2 ila 4 kişi".
        out = replace(out, #"\b(\d{1,4})\s?[-–]\s?(\d{1,4})\b"#, "$1 ila $2")
        out = replace(out, #"[ \t]+"#, " ")
        out = replace(out, #"\s*\n\s*"#, "\n")
        return out.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Akan cevaptan okunmaya hazır cümleleri ayırır. `final` ise kalan da hazırdır.
    /// `consumed`: metnin başından tüketilen karakter sayısı (UTF-16).
    static func takeSentences(_ text: String, final: Bool) -> (ready: [String], consumed: Int) {
        let ns = text as NSString
        let boundary = try! NSRegularExpression(pattern: #"[.!?…]+["'”’)\]]*(?=\s)|\n+"#)
        var ready: [String] = []
        var start = 0
        for match in boundary.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let end = match.range.location + match.range.length
            push(ns.substring(with: NSRange(location: start, length: end - start)), into: &ready)
            start = end
        }
        if final {
            push(ns.substring(from: start), into: &ready)
            start = ns.length
        }
        return (ready, start)
    }

    /// Çok uzun cümleyi virgülden, olmazsa boşluktan böler.
    static func splitLong(_ piece: String, max: Int = maxChars) -> [String] {
        var parts: [String] = []
        var rest = piece
        while rest.count > max {
            let window = String(rest.prefix(max))
            let comma = [window.range(of: ", ", options: .backwards), window.range(of: "; ", options: .backwards)]
                .compactMap { $0.map { window.distance(from: window.startIndex, to: $0.lowerBound) } }
                .max() ?? -1
            let space = window.range(of: " ", options: .backwards).map { window.distance(from: window.startIndex, to: $0.lowerBound) } ?? -1
            let at = comma > max / 3 ? comma + 1 : space
            let index = at > 0 ? at : max
            parts.append(String(rest.prefix(index)).trimmingCharacters(in: .whitespaces))
            rest = String(rest.dropFirst(index)).trimmingCharacters(in: .whitespaces)
        }
        if !rest.isEmpty { parts.append(rest) }
        return parts
    }

    private static func push(_ raw: String, into target: inout [String]) {
        let piece = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !piece.isEmpty else { return }
        target.append(contentsOf: splitLong(piece))
    }

    private static func replace(_ text: String, _ pattern: String, _ template: String, caseInsensitive: Bool = false) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : []) else { return text }
        return regex.stringByReplacingMatches(in: text, range: NSRange(text.startIndex..., in: text), withTemplate: template)
    }

    private static func replaceHours(_ text: String) -> String {
        guard let regex = try? NSRegularExpression(pattern: #"\b([01]?\d|2[0-3]):([0-5]\d)\b"#) else { return text }
        let ns = text as NSString
        var out = text
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)).reversed() {
            let hour = String(Int(ns.substring(with: match.range(at: 1))) ?? 0)
            let minute = ns.substring(with: match.range(at: 2))
            let spoken = minute == "00" ? hour : "\(hour) \(minute)"
            out = (out as NSString).replacingCharacters(in: match.range, with: spoken)
        }
        return out
    }
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlertCircle, IconShieldLock, IconStar, IconStarFilled } from "@tabler/icons-react";

interface MessageRow {
  id: string;
  senderRole: "guest" | "hotel" | "system";
  senderName: string | null;
  body: string;
  createdAt: string;
}

interface ReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  status: "beklemede" | "yayinda" | "reddedildi";
  reply: string | null;
}

/**
 * Gövdesi olmayan ya da JSON olmayan yanıtlarda null döner.
 *
 * Uçlar hata durumunda (ör. veritabanına ulaşılamıyor) boş gövdeli 500
 * dönebiliyor; doğrudan res.json() çağrısı o noktada exception atıp
 * bileşeni sonsuz yükleniyor durumunda bırakıyordu.
 */
async function readJson(res: Response): Promise<{ ok?: boolean; error?: string; [key: string]: unknown } | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

const GENERIC_ERROR = "Şu anda bağlantı kurulamadı. Lütfen biraz sonra tekrar deneyin.";

const reviewStatusText: Record<ReviewRow["status"], string> = {
  beklemede: "Yorumunuz inceleniyor — onaylandıktan sonra tesis sayfasında görünecek.",
  yayinda: "Yorumunuz yayında.",
  reddedildi: "Yorumunuz yayınlanmadı.",
};

export function InquiryPortalClient({ token }: { token: string }) {
  const [inquiry, setInquiry] = useState<{ name: string; status: string; hotelSlug: string | null } | null>(null);
  const [messages, setMessages] = useState<MessageRow[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewRow | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 0, title: "", body: "" });
  const [sendingReview, setSendingReview] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [erased, setErased] = useState(false);
  const [confirmingErase, setConfirmingErase] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; message: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const [msgRes, reviewRes] = await Promise.all([
        fetch(`/api/inquiry/portal/${token}/messages`),
        fetch(`/api/inquiry/portal/${token}/review`),
      ]);
      const json = await readJson(msgRes);
      if (json?.ok) {
        setInquiry(json.inquiry as typeof inquiry);
        setMessages(json.messages as MessageRow[]);
        setError(null);
      } else {
        setError(json?.error ?? GENERIC_ERROR);
        // Yükleniyor durumundan çık: hata ekranı gösterilebilsin.
        setMessages([]);
      }
      const reviewJson = await readJson(reviewRes);
      if (reviewJson?.ok) {
        setReview(reviewJson.review as ReviewRow | null);
        setCanReview(Boolean(reviewJson.canReview));
      }
    } catch {
      // Ağ hatası — fetch'in kendisi reddetti.
      setError(GENERIC_ERROR);
      setMessages([]);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function sendMessage() {
    if (!body.trim()) return;
    const res = await fetch(`/api/inquiry/portal/${token}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const json = await readJson(res);
    if (json?.ok) {
      setBody("");
      void reload();
    } else {
      setNotice({ tone: "error", message: json?.error ?? "Gönderilemedi." });
    }
  }

  async function sendReview() {
    if (reviewForm.rating < 1 || !reviewForm.body.trim()) return;
    setSendingReview(true);
    const res = await fetch(`/api/inquiry/portal/${token}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rating: reviewForm.rating,
        title: reviewForm.title.trim() || undefined,
        body: reviewForm.body,
      }),
    });
    const json = await readJson(res);
    setSendingReview(false);
    if (json?.ok) {
      setNotice({ tone: "ok", message: "Yorumunuz alındı — inceleme sonrası yayınlanacak." });
      setReviewForm({ rating: 0, title: "", body: "" });
      void reload();
    } else {
      setNotice({ tone: "error", message: json?.error ?? "Yorum gönderilemedi." });
    }
  }

  async function downloadData() {
    const res = await fetch(`/api/inquiry/portal/${token}/data`);
    const json = await readJson(res);
    if (!json?.ok) {
      setNotice({ tone: "error", message: json?.error ?? "Veriler alınamadı." });
      return;
    }
    // Tarayıcıda dosya olarak indir — sunucuda kopya bırakmaya gerek yok.
    const blob = new Blob([JSON.stringify(json.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dengizek-verilerim.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function eraseData() {
    setErasing(true);
    const res = await fetch(`/api/inquiry/portal/${token}/data`, { method: "POST" });
    const json = await readJson(res);
    setErasing(false);
    setConfirmingErase(false);
    if (json?.ok) {
      setErased(true);
    } else {
      setNotice({ tone: "error", message: json?.error ?? "Silinemedi." });
    }
  }

  // Hata, yükleniyor durumundan ÖNCE gelir: istek başarısızsa messages null
  // kalabiliyor ve ekran sonsuz spinner'da takılıyordu.
  if (error) {
    return (
      <div className="er-portal">
        <p className="er-portal-alert" role="alert">
          <IconAlertCircle size={18} />
          {error}
        </p>
        <button type="button" className="er-btn er-btn-ghost" onClick={() => void reload()}>
          Tekrar dene
        </button>
      </div>
    );
  }

  if (!messages) {
    return (
      <div className="er-portal">
        <p className="er-muted" style={{ margin: 0, textAlign: "center" }}>
          Mesajlar yükleniyor…
        </p>
      </div>
    );
  }

  return (
    <div className="er-portal">
      <header>
        <p className="er-eyebrow" style={{ marginBottom: 10, color: "var(--er-primary)" }}>
          Talep portalı
        </p>
        <h1 className="er-display er-h1">Talep mesajları</h1>
        <p className="er-muted" style={{ margin: "8px 0 0", fontSize: 15 }}>
          Merhaba {inquiry?.name} — tesisinizle yazışmalarınız
        </p>
      </header>

      {notice && (
        <p
          className="er-portal-alert"
          data-tone={notice.tone}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}

      <section className="er-card er-portal-card" aria-label="Mesajlar">
        {messages.length === 0 && (
          <p className="er-muted" style={{ margin: 0, fontSize: 14 }}>
            Henüz mesaj yok. Aşağıdan yazabilirsiniz.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className="er-portal-message" data-own={m.senderRole === "guest"}>
            <p className="er-portal-meta">
              {m.senderRole === "guest" ? "Siz" : m.senderName ?? "Tesis"} —{" "}
              {new Date(m.createdAt).toLocaleString("tr-TR")}
            </p>
            <p>{m.body}</p>
          </div>
        ))}
      </section>

      <div>
        <label className="er-field-label" htmlFor="portal-message">
          Mesajınız
        </label>
        <textarea
          id="portal-message"
          className="er-textarea"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
        />
        <button
          type="button"
          className="er-btn er-btn-cta"
          style={{ marginTop: 12 }}
          disabled={!body.trim()}
          onClick={sendMessage}
        >
          Gönder
        </button>
      </div>

      {canReview && (
        <section className="er-card er-portal-card">
          <h2 className="er-display er-portal-title">
            <IconStar size={18} />
            Konaklamanızı değerlendirin
          </h2>

          {review ? (
            <>
              <div className="er-portal-stars" aria-label={`${review.rating} / 5`}>
                {[1, 2, 3, 4, 5].map((n) =>
                  n <= review.rating ? <IconStarFilled key={n} size={20} /> : <IconStar key={n} size={20} />,
                )}
              </div>
              <p className="er-chip" style={{ margin: 0, alignSelf: "flex-start", textTransform: "none", letterSpacing: 0 }}>
                {reviewStatusText[review.status]}
              </p>
              {review.title && <p style={{ margin: 0, fontWeight: 600 }}>{review.title}</p>}
              <p style={{ margin: 0, fontSize: 14 }}>{review.body}</p>
              {review.reply && (
                <div className="er-portal-message">
                  <p className="er-portal-meta">Tesisin yanıtı</p>
                  <p>{review.reply}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="er-muted" style={{ margin: 0, fontSize: 14 }}>
                Yorumunuz tesis sayfasında &quot;doğrulanmış misafir&quot; olarak gösterilir.
                Yayınlanmadan önce incelenir.
              </p>
              <div className="er-portal-stars" role="radiogroup" aria-label="Puan">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={reviewForm.rating === n}
                    aria-label={`${n} yıldız`}
                    onClick={() => setReviewForm({ ...reviewForm, rating: n })}
                  >
                    {n <= reviewForm.rating ? <IconStarFilled size={28} /> : <IconStar size={28} />}
                  </button>
                ))}
              </div>
              <div>
                <label className="er-field-label" htmlFor="portal-review-title">
                  Başlık (opsiyonel)
                </label>
                <input
                  id="portal-review-title"
                  className="er-input"
                  value={reviewForm.title}
                  onChange={(e) => setReviewForm({ ...reviewForm, title: e.currentTarget.value })}
                />
              </div>
              <div>
                <label className="er-field-label" htmlFor="portal-review-body">
                  Yorumunuz
                </label>
                <textarea
                  id="portal-review-body"
                  className="er-textarea"
                  rows={3}
                  value={reviewForm.body}
                  onChange={(e) => setReviewForm({ ...reviewForm, body: e.currentTarget.value })}
                />
              </div>
              <button
                type="button"
                className="er-btn er-btn-primary"
                style={{ alignSelf: "flex-start" }}
                onClick={sendReview}
                disabled={sendingReview || reviewForm.rating < 1 || reviewForm.body.trim().length === 0}
              >
                {sendingReview ? "Gönderiliyor…" : "Yorumu gönder"}
              </button>
            </>
          )}
        </section>
      )}

      <section className="er-card er-portal-card">
        <h2 className="er-display er-portal-title">
          <IconShieldLock size={18} />
          Verileriniz
        </h2>
        {erased ? (
          <p className="er-portal-alert" data-tone="ok" role="status">
            Kişisel verileriniz silindi. Bu bağlantı artık geçersiz.
          </p>
        ) : (
          <>
            <p className="er-muted" style={{ margin: 0, fontSize: 14 }}>
              Bu talep kapsamında sakladığımız kişisel verileri indirebilir veya
              silinmesini isteyebilirsiniz. Silme sonrası bu portal bağlantısı geçersiz olur;
              tesisin ticari kaydı adınız olmadan saklanmaya devam eder.
            </p>
            {confirmingErase ? (
              <div className="er-portal-confirm" role="alertdialog" aria-label="Veri silme onayı">
                <p>
                  Kişisel verileriniz silinsin mi? Bu işlem geri alınamaz ve bu bağlantı geçersiz
                  olur.
                </p>
                <div className="er-portal-actions">
                  <button type="button" className="er-btn er-btn-danger" disabled={erasing} onClick={eraseData}>
                    {erasing ? "Siliniyor…" : "Evet, sil"}
                  </button>
                  <button
                    type="button"
                    className="er-btn er-btn-ghost"
                    disabled={erasing}
                    onClick={() => setConfirmingErase(false)}
                  >
                    Vazgeç
                  </button>
                </div>
              </div>
            ) : (
              <div className="er-portal-actions">
                <button type="button" className="er-btn er-btn-ghost" onClick={downloadData}>
                  Verilerimi indir
                </button>
                <button type="button" className="er-btn er-btn-ghost er-btn-danger-ghost" onClick={() => setConfirmingErase(true)}>
                  Verilerimi sil
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

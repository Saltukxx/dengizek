"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { inquiryFormSchema, type InquiryFormValues } from "@/lib/schemas/inquiry";
import { trackEvent } from "@/lib/analytics-client";

type RoomOption = { slug: string; name: string };

export function InquiryForm() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isWinter = pathname.startsWith("/kis/");
  const hotelFromQuery = search.get("hotel") ?? undefined;
  const roomFromQuery = search.get("room") ?? undefined;
  const tourFromQuery = search.get("tour") ?? undefined;
  const stepFromQuery = search.get("step") ?? undefined;
  const sourceFromQuery = search.get("source") ?? "web";

  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [hotelName, setHotelName] = useState<string | null>(null);
  const [cancellationSummary, setCancellationSummary] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<InquiryFormValues>({
    resolver: zodResolver(inquiryFormSchema),
    defaultValues: {
      name: "",
      email: "",
      message: "",
      marketingConsent: false,
      hotelSlug: hotelFromQuery,
      roomSlug: roomFromQuery,
      tourId: tourFromQuery,
      stepKey: stepFromQuery,
      source: sourceFromQuery as InquiryFormValues["source"],
      checkIn: "",
      checkOut: "",
      adults: 2,
      children: 0,
    },
  });

  useEffect(() => {
    if (!hotelFromQuery) return;
    void fetch(`/api/public/hotels/${hotelFromQuery}/rooms`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setRooms(j.rooms);
        // Bağlam rozetinde slug yerine tesisin yayındaki adı gösterilir.
        if (j.hotel?.name) setHotelName(j.hotel.name as string);
      });
    void fetch(`/api/public/hotels/${hotelFromQuery}/cancellation-summary`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setCancellationSummary(j.summary);
      });
    void trackEvent("inquiry_start", { hotelSlug: hotelFromQuery });
  }, [hotelFromQuery]);

  const onSubmit = handleSubmit(async (data) => {
    const payload = {
      ...data,
      hotelSlug: data.hotelSlug || hotelFromQuery,
      roomSlug: data.roomSlug || roomFromQuery,
      tourId: data.tourId || tourFromQuery,
      stepKey: data.stepKey || stepFromQuery,
      source: data.source || sourceFromQuery,
    };
    const res = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 429) {
      setError("root", { message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin." });
      return;
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      setError("root", { message: json?.error ?? "Gönderilemedi. Lütfen tekrar deneyin." });
      return;
    }
    const emailStatus = ["queued", "sent", "unavailable"].includes(json.emailStatus)
      ? json.emailStatus
      : "unavailable";
    router.push(`${isWinter ? "/kis/talep/basarili" : "/inquiry/success"}?emailStatus=${emailStatus}`);
  });

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "clamp(32px, 5vw, 64px) clamp(24px, 5vw, 48px)",
      }}
    >
      <div style={{ marginBottom: "clamp(28px, 4vw, 48px)" }}>
        <p className="er-eyebrow" style={{ marginBottom: 10, color: "var(--er-primary)" }}>
          Rezervasyon
        </p>
        <h1 className="er-display er-h1" style={{ marginBottom: 12 }}>
          Talep Gönder
        </h1>
        <p style={{ margin: 0, color: "var(--er-text-muted)", fontSize: 15, lineHeight: 1.6 }}>
          Talebiniz otele iletilecek; yanıtı e-postanıza gelen bağlantıdaki Otelsayfam portalından alırsınız. Müsaitlik bilgilendiricidir; kesin onay otelden gelir.
        </p>
      </div>

      {hotelFromQuery && (
        <div
          style={{
            marginBottom: 24,
            padding: "10px 16px",
            background: "var(--er-primary-tint)",
            border: "1px solid var(--er-line)",
            borderRadius: 4,
            fontFamily: "var(--er-font-sans)",
            fontSize: 13,
            color: "var(--er-text-muted)",
          }}
        >
          Otel:{" "}
          <strong style={{ color: "var(--er-primary)" }}>{hotelName ?? hotelFromQuery}</strong>
          {roomFromQuery && (
            <>
              {" "}
              · Oda:{" "}
              <strong>
                {rooms.find((r) => r.slug === roomFromQuery)?.name ?? roomFromQuery}
              </strong>
            </>
          )}
        </div>
      )}

      {hotelFromQuery && cancellationSummary && (
        <div
          style={{
            marginBottom: 24,
            padding: "12px 16px",
            background: "var(--er-surface-2)",
            border: "1px solid var(--er-line)",
            borderRadius: "var(--er-radius)",
            fontFamily: "var(--er-font-sans)",
            fontSize: 13,
            color: "var(--er-text-muted)",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: "var(--er-text)", display: "block", marginBottom: 4 }}>
            İptal koşulları
          </strong>
          {cancellationSummary}
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {errors.root && (
            <div
              style={{
                padding: "10px 16px",
                background: "var(--er-error-tint)",
                border: "1px solid var(--er-error)",
                borderRadius: "var(--er-radius)",
                color: "var(--er-error)",
                fontSize: 13,
              }}
            >
              {errors.root.message}
            </div>
          )}

          <div className="er-inquiry-pair">
            <div>
              <label className="er-field-label" htmlFor="inquiry-check-in">Giriş</label>
              <input id="inquiry-check-in" type="date" {...register("checkIn")} className="er-input" />
            </div>
            <div>
              <label className="er-field-label" htmlFor="inquiry-check-out">Çıkış</label>
              <input id="inquiry-check-out" type="date" {...register("checkOut")} className="er-input" />
            </div>
          </div>

          <div className="er-inquiry-pair">
            <div>
              <label className="er-field-label" htmlFor="inquiry-adults">Yetişkin</label>
              <input id="inquiry-adults" type="number" min={1} max={20} {...register("adults")} className="er-input" />
            </div>
            <div>
              <label className="er-field-label" htmlFor="inquiry-children">Çocuk</label>
              <input id="inquiry-children" type="number" min={0} max={20} {...register("children")} className="er-input" />
            </div>
          </div>

          {rooms.length > 0 && (
            <div>
              <label className="er-field-label" htmlFor="inquiry-room">Oda tipi</label>
              <select id="inquiry-room" {...register("roomSlug")} className="er-input" defaultValue={roomFromQuery ?? ""}>
                <option value="">Seçin (opsiyonel)</option>
                {rooms.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="er-field-label" htmlFor="inquiry-name">
              Ad Soyad <span style={{ color: "var(--er-cta)" }}>*</span>
            </label>
            <input id="inquiry-name" {...register("name")} className="er-input" placeholder="Adınız ve soyadınız" />
            {errors.name && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--er-error)" }}>{errors.name.message}</p>}
          </div>

          <div>
            <label className="er-field-label" htmlFor="inquiry-email">
              E-posta <span style={{ color: "var(--er-cta)" }}>*</span>
            </label>
            <input id="inquiry-email" {...register("email")} type="email" className="er-input" placeholder="ornek@email.com" />
            {errors.email && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--er-error)" }}>{errors.email.message}</p>}
          </div>

          <div>
            <label className="er-field-label" htmlFor="inquiry-message">
              Mesaj <span style={{ color: "var(--er-cta)" }}>*</span>
            </label>
            <textarea id="inquiry-message" {...register("message")} className="er-textarea" placeholder="Özel talepler…" rows={5} />
            {errors.message && <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--er-error)" }}>{errors.message.message}</p>}
          </div>

          <input type="hidden" {...register("hotelSlug")} />
          <input type="hidden" {...register("tourId")} />
          <input type="hidden" {...register("stepKey")} />
          <input type="hidden" {...register("source")} />

          <Controller
            name="marketingConsent"
            control={control}
            render={({ field }) => (
              <label style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", fontSize: 13, color: "var(--er-text-muted)" }}>
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.currentTarget.checked)}
                  onBlur={field.onBlur}
                  style={{ marginTop: 2, accentColor: "var(--er-primary)" }}
                />
                Bu talep ve (isteğe bağlı) gelecek teklifler için benimle iletişime geçilmesini kabul ediyorum
              </label>
            )}
          />

          <button type="submit" disabled={isSubmitting} className="er-btn er-btn-cta" data-testid="inquiry-submit">
            {isSubmitting ? "Gönderiliyor…" : "Talebi Gönder"}
          </button>
        </div>
      </form>
    </div>
  );
}

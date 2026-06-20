"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { useSearchParams, useRouter } from "next/navigation";
import { inquiryFormSchema, type InquiryFormValues } from "@/lib/schemas/inquiry";

export function InquiryForm() {
  const search = useSearchParams();
  const router = useRouter();
  const hotelFromQuery = search.get("hotel") ?? undefined;

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
      phone: "",
      message: "",
      marketingConsent: false,
      hotelSlug: hotelFromQuery,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    const payload = { ...data, hotelSlug: data.hotelSlug || hotelFromQuery };
    const res = await fetch("/api/inquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.status === 429) {
      setError("root", { message: "Çok fazla istek. Lütfen daha sonra tekrar deneyin." });
      return;
    }
    if (!res.ok) {
      setError("root", { message: "Gönderilemedi. Lütfen tekrar deneyin." });
      return;
    }
    router.push("/inquiry/success");
  });

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "clamp(32px, 5vw, 64px) clamp(24px, 5vw, 48px)",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: "clamp(28px, 4vw, 48px)" }}>
        <p
          style={{
            margin: "0 0 10px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            color: "var(--lux-gold)",
          }}
        >
          Rezervasyon
        </p>
        <h1
          style={{
            margin: "0 0 12px",
            fontFamily: "var(--lux-font-sans)",
            fontSize: "clamp(28px, 4vw, 40px)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1.1,
            color: "var(--lux-text)",
          }}
        >
          Talep Gönder
        </h1>
        <div style={{ width: 48, height: 2, background: "var(--lux-gold)", opacity: 0.6, marginBottom: 16 }} />
        <p style={{ margin: 0, color: "var(--lux-muted)", fontSize: 14, lineHeight: 1.6 }}>
          Talebiniz otele veya ön büroya iletilecek. Bu demoda çevrimiçi rezervasyon yoktur.
        </p>
      </div>

      {hotelFromQuery && (
        <div
          style={{
            marginBottom: 24,
            padding: "10px 16px",
            background: "rgba(212,175,55,0.07)",
            border: "1px solid rgba(212,175,55,0.22)",
            borderRadius: 4,
            fontFamily: "var(--lux-font-sans)",
            fontSize: 13,
            color: "var(--lux-muted)",
          }}
        >
          Otel: <strong style={{ color: "var(--lux-gold)" }}>{hotelFromQuery}</strong>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {errors.root && (
            <div
              style={{
                padding: "10px 16px",
                background: "rgba(255,80,80,0.08)",
                border: "1px solid rgba(255,80,80,0.22)",
                borderRadius: 4,
                color: "#ff8080",
                fontSize: 13,
                fontFamily: "var(--lux-font-sans)",
              }}
            >
              {errors.root.message}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="lux-input-label">
              Ad Soyad <span style={{ color: "rgba(212,175,55,0.6)" }}>*</span>
            </label>
            <input
              {...register("name")}
              className="lux-input"
              placeholder="Adınız ve soyadınız"
            />
            {errors.name && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ff8080" }}>
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="lux-input-label">
              E-posta <span style={{ color: "rgba(212,175,55,0.6)" }}>*</span>
            </label>
            <input
              {...register("email")}
              type="email"
              className="lux-input"
              placeholder="ornek@email.com"
            />
            {errors.email && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ff8080" }}>
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="lux-input-label">Telefon</label>
            <input
              {...register("phone")}
              type="tel"
              className="lux-input"
              placeholder="+90 5xx xxx xx xx"
            />
            {errors.phone && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ff8080" }}>
                {errors.phone.message}
              </p>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="lux-input-label">
              Mesaj <span style={{ color: "rgba(212,175,55,0.6)" }}>*</span>
            </label>
            <textarea
              {...register("message")}
              className="lux-textarea"
              placeholder="Tarihler, oda tercihi, özel talepler…"
              rows={5}
            />
            {errors.message && (
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ff8080" }}>
                {errors.message.message}
              </p>
            )}
          </div>

          <input type="hidden" {...register("hotelSlug")} />

          {/* Marketing consent */}
          <Controller
            name="marketingConsent"
            control={control}
            render={({ field }) => (
              <label
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                  cursor: "pointer",
                  fontFamily: "var(--lux-font-sans)",
                  fontSize: 13,
                  color: "var(--lux-muted)",
                  lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={field.value}
                  onChange={(e) => field.onChange(e.currentTarget.checked)}
                  onBlur={field.onBlur}
                  style={{
                    marginTop: 2,
                    accentColor: "var(--lux-gold)",
                    width: 16,
                    height: 16,
                    flexShrink: 0,
                  }}
                />
                Bu talep ve (isteğe bağlı) gelecek teklifler için benimle iletişime geçilmesini kabul ediyorum
              </label>
            )}
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="luxury-gold-button"
            data-testid="inquiry-submit"
            style={{
              borderRadius: 2,
              opacity: isSubmitting ? 0.7 : 1,
              cursor: isSubmitting ? "wait" : "pointer",
            }}
          >
            {isSubmitting ? "Gönderiliyor…" : "Talebi Gönder"}
          </button>
        </div>
      </form>
    </div>
  );
}

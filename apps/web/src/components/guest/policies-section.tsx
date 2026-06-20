// ---------------------------------------------------------------------------
// Misafir "Bilmeniz Gerekenler" bölümü — politikalar + iletişim/konum.
// ---------------------------------------------------------------------------

import {
  IconBabyCarriage,
  IconCalendarX,
  IconCreditCard,
  IconMail,
  IconMapPin,
  IconPaw,
  IconPhone,
  IconPlane,
} from "@tabler/icons-react";
import type { HotelSpecs } from "@/lib/hotels-repo";
import { paymentMethodLabels } from "@/lib/schemas/hotel-content";

export function PoliciesSection({ specs }: { specs: HotelSpecs }) {
  const policies: { icon: typeof IconCalendarX; title: string; body: string }[] = [];
  if (specs.cancellationPolicy) {
    policies.push({ icon: IconCalendarX, title: "İptal Politikası", body: specs.cancellationPolicy });
  }
  if (specs.childPolicy) {
    policies.push({ icon: IconBabyCarriage, title: "Çocuk Politikası", body: specs.childPolicy });
  }
  if (specs.petsAllowed !== null) {
    policies.push({
      icon: IconPaw,
      title: "Evcil Hayvan",
      body: specs.petsAllowed ? "Evcil hayvan kabul edilir." : "Evcil hayvan kabul edilmez.",
    });
  }
  if (specs.paymentMethods.length > 0) {
    policies.push({
      icon: IconCreditCard,
      title: "Ödeme Yöntemleri",
      body: specs.paymentMethods
        .map((m) => paymentMethodLabels[m as keyof typeof paymentMethodLabels] ?? m)
        .join(", "),
    });
  }

  const contact: { icon: typeof IconMapPin; label: string }[] = [];
  if (specs.address) contact.push({ icon: IconMapPin, label: specs.address });
  if (specs.phone) contact.push({ icon: IconPhone, label: specs.phone });
  if (specs.contactEmail) contact.push({ icon: IconMail, label: specs.contactEmail });
  if (specs.airportDistanceKm != null) {
    contact.push({ icon: IconPlane, label: `Havalimanına ${specs.airportDistanceKm} km` });
  }

  if (policies.length === 0 && contact.length === 0) return null;

  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "0 32px 96px" }}>
      <div style={{ marginBottom: 42 }}>
        <h2
          className="luxury-sans-title"
          style={{ margin: 0, fontSize: "clamp(36px, 4.5vw, 56px)", lineHeight: 1.08 }}
        >
          Bilmeniz Gerekenler
        </h2>
        <div style={{ width: 50, height: 4, background: "var(--lux-gold)", marginTop: 16 }} />
      </div>

      {policies.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
            gap: 22,
            marginBottom: contact.length > 0 ? 40 : 0,
          }}
        >
          {policies.map((p) => (
            <div
              key={p.title}
              className="luxury-glass"
              style={{
                padding: "22px 24px",
                borderRadius: 8,
                border: "1px solid rgba(212,175,55,0.16)",
              }}
            >
              <p
                className="luxury-label"
                style={{
                  margin: "0 0 10px",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--lux-gold)",
                  fontSize: 12,
                }}
              >
                <p.icon size={16} />
                {p.title}
              </p>
              <p style={{ margin: 0, color: "var(--lux-muted)", fontSize: 14, lineHeight: 1.65 }}>
                {p.body}
              </p>
            </div>
          ))}
        </div>
      )}

      {contact.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            color: "var(--lux-muted)",
            fontSize: 14,
          }}
        >
          {contact.map((c) => (
            <span key={c.label} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <c.icon size={17} color="var(--lux-gold)" />
              {c.label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

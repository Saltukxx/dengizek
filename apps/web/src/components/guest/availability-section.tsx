export interface AvailabilityNoteGuest {
  label: string;
  startDate: string | null;
  endDate: string | null;
  isBlackout: boolean;
}

interface AvailabilitySectionProps {
  notes: AvailabilityNoteGuest[];
  blackoutText?: string | null;
}

export function AvailabilitySection({ notes, blackoutText }: AvailabilitySectionProps) {
  const text = blackoutText?.trim();
  if (notes.length === 0 && !text) return null;

  return (
    <section style={{ maxWidth: 1280, margin: "0 auto", padding: "48px 32px" }}>
      <h2
        className="luxury-sans-title"
        style={{ margin: "0 0 8px", fontSize: "clamp(28px, 3vw, 40px)" }}
      >
        Müsaitlik
      </h2>
      <div style={{ width: 48, height: 2, background: "var(--lux-gold)", marginBottom: 24 }} />
      {text && (
        <div
          className="luxury-glass"
          style={{
            padding: "16px 20px",
            borderRadius: 8,
            marginBottom: notes.length > 0 ? 20 : 0,
            borderLeft: "3px solid var(--lux-gold)",
          }}
        >
          <p style={{ margin: 0, color: "var(--lux-muted)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {text}
          </p>
        </div>
      )}
      {notes.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {notes.map((n, i) => (
            <li
              key={`${n.label}-${i}`}
              className="luxury-glass"
              style={{
                padding: "14px 18px",
                borderRadius: 8,
                borderLeft: n.isBlackout ? "3px solid #c92a2a" : "3px solid rgba(212,175,55,0.5)",
              }}
            >
              <strong style={{ display: "block", marginBottom: 4 }}>{n.label}</strong>
              {(n.startDate || n.endDate) && (
                <span style={{ fontSize: 13, color: "var(--lux-muted)" }}>
                  {n.startDate ?? "—"} — {n.endDate ?? "—"}
                  {n.isBlackout ? " · Kapalı dönem" : ""}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

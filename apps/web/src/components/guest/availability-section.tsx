"use client";

import { useEffect, useState } from "react";

export interface AvailabilityNoteGuest {
  label: string;
  startDate: string | null;
  endDate: string | null;
  isBlackout: boolean;
}

interface InventoryDay {
  date: string;
  roomName: string;
  allotment: number;
  stopSell: boolean;
}

interface AvailabilitySectionProps {
  hotelSlug: string;
  notes: AvailabilityNoteGuest[];
  blackoutText?: string | null;
}

export function AvailabilitySection({ hotelSlug, notes, blackoutText }: AvailabilitySectionProps) {
  const [inventoryDays, setInventoryDays] = useState<InventoryDay[]>([]);

  useEffect(() => {
    void fetch(`/api/public/hotels/${hotelSlug}/availability-summary`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setInventoryDays(j.days ?? []);
      });
  }, [hotelSlug]);

  const text = blackoutText?.trim();
  if (notes.length === 0 && !text && inventoryDays.length === 0) return null;

  return (
    <section className="er-detail-section">
      <h2
        className="er-display"
        style={{ margin: "0 0 8px", fontSize: "clamp(28px, 3vw, 40px)" }}
      >
        Müsaitlik
      </h2>
      
      {inventoryDays.length > 0 && (
        <div
          className="er-card"
          style={{
            padding: "16px 20px",
            borderRadius: "var(--er-radius-md)",
            marginBottom: 20,
            borderLeft: "3px solid #e67700",
          }}
        >
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--er-text)" }}>
            Önümüzdeki 14 günde sınırlı müsaitlik
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {inventoryDays.slice(0, 8).map((d) => (
              <li key={`${d.date}-${d.roomName}`} style={{ fontSize: 13, color: "var(--er-text-muted)" }}>
                {d.date} · {d.roomName}:{" "}
                {d.stopSell ? "Satış kapalı" : `${d.allotment} oda`}
              </li>
            ))}
          </ul>
        </div>
      )}
      {text && (
        <div
          className="er-card"
          style={{
            padding: "16px 20px",
            borderRadius: "var(--er-radius-md)",
            marginBottom: notes.length > 0 ? 20 : 0,
            borderLeft: "3px solid var(--er-primary)",
          }}
        >
          <p style={{ margin: 0, color: "var(--er-text-muted)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {text}
          </p>
        </div>
      )}
      {notes.length > 0 && (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {notes.map((n, i) => (
            <li
              key={`${n.label}-${i}`}
              className="er-card"
              style={{
                padding: "14px 18px",
                borderRadius: "var(--er-radius-md)",
                borderLeft: n.isBlackout ? "3px solid var(--er-error)" : "3px solid var(--er-primary)",
              }}
            >
              <strong style={{ display: "block", marginBottom: 4 }}>{n.label}</strong>
              {(n.startDate || n.endDate) && (
                <span style={{ fontSize: 13, color: "var(--er-text-muted)" }}>
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

import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "clamp(48px, 8vw, 80px) 24px",
        gap: 16,
      }}
    >
      {icon && (
        <div style={{ color: "var(--lux-gold)", opacity: 0.6 }}>{icon}</div>
      )}
      <h3
        style={{
          margin: 0,
          fontFamily: "var(--lux-font-sans)",
          fontSize: "clamp(20px, 2.5vw, 28px)",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--lux-text)",
          maxWidth: 480,
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          style={{
            margin: 0,
            fontFamily: "var(--lux-font-sans)",
            fontSize: 15,
            color: "var(--lux-muted)",
            maxWidth: 400,
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

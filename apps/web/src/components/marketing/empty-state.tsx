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
      className="er-card"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        padding: "clamp(40px, 6vw, 64px) 24px",
        gap: 14,
      }}
    >
      {icon && <div style={{ color: "var(--er-primary)", opacity: 0.7 }}>{icon}</div>}
      <h3 className="er-display er-h3">{title}</h3>
      {description && (
        <p className="er-muted" style={{ margin: 0, maxWidth: 420, fontSize: 15 }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

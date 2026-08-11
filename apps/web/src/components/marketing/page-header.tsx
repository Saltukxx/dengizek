import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  order?: 1 | 2;
};

export function PageHeader({ title, description, action, order = 1 }: PageHeaderProps) {
  const Tag = order === 1 ? "h1" : "h2";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16,
        marginBottom: "clamp(24px, 3vw, 40px)",
      }}
    >
      <div style={{ maxWidth: 640 }}>
        <Tag
          className="er-display"
          style={{
            marginBottom: 8,
            fontSize: order === 1 ? "clamp(26px, 4vw, 40px)" : "clamp(20px, 3vw, 30px)",
          }}
        >
          {title}
        </Tag>
        {description && (
          <p className="er-muted" style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

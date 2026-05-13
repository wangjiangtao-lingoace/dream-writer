import React from "react";

interface TopBarProps {
  title?: string;
  breadcrumbs?: Array<{ label: string; path?: string }>;
  actions?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ title, breadcrumbs, actions }) => {
  return (
    <header
      style={{
        height: "var(--topbar-height)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--space-4)",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <span style={{ color: "var(--text-disabled)", fontSize: "var(--text-xs)" }}>/</span>
                )}
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: crumb.path ? "var(--text-secondary)" : "var(--text-primary)",
                    cursor: crumb.path ? "pointer" : "default",
                  }}
                >
                  {crumb.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
        {title && !breadcrumbs && (
          <h1 style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)" }}>
            {title}
          </h1>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: "var(--space-2)" }}>{actions}</div>}
    </header>
  );
};

import React from "react";

interface AIAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  description: string;
  primary?: boolean;
}

interface AIPanelProps {
  context: string;
  actions: AIAction[];
  onAction: (key: string) => void;
  result?: React.ReactNode;
  loading?: boolean;
  collapsed?: boolean;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  context,
  actions,
  onAction,
  result,
  loading = false,
  collapsed = false,
}) => {
  if (collapsed) return null;

  return (
    <aside
      aria-label="AI 助手"
      style={{
        width: "var(--ai-panel-width)",
        height: "100%",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--success)",
          }}
        />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)" }}>
          AI 助手
        </span>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {context}
        </span>
      </div>

      {/* Actions */}
      <div style={{ padding: "var(--space-3)", flex: 1, overflow: "auto" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
          可用操作
        </div>
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={() => onAction(action.key)}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              width: "100%",
              padding: "var(--space-3)",
              background: action.primary ? "var(--accent-muted)" : "var(--bg-elevated)",
              border: `1px solid ${action.primary ? "rgba(99,102,241,0.2)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-lg)",
              color: action.primary ? "var(--accent-hover)" : "var(--text-primary)",
              fontSize: "var(--text-sm)",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
              marginBottom: "var(--space-2)",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{action.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{action.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                {action.description}
              </div>
            </div>
            {action.shortcut && (
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-disabled)",
                  background: "var(--bg-overlay)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {action.shortcut}
              </span>
            )}
          </button>
        ))}

        {/* Result area */}
        {result && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              结果
            </div>
            {result}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "var(--space-4)", color: "var(--text-muted)" }}>
            <div style={{ width: 20, height: 20, border: "2px solid var(--border-default)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto var(--space-2)" }} />
            <span style={{ fontSize: "var(--text-xs)" }}>AI 处理中...</span>
          </div>
        )}
      </div>
    </aside>
  );
};

import React from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: "danger" | "warning" | "info";
}

const VARIANT_STYLES: Record<string, { bg: string; hover: string }> = {
  danger: { bg: "var(--error)", hover: "#dc2626" },
  warning: { bg: "var(--warning)", hover: "#ca8a04" },
  info: { bg: "var(--accent)", hover: "var(--accent-hover)" },
};

export function ConfirmDialog({
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  variant = "danger",
}: ConfirmDialogProps) {
  const vStyle = VARIANT_STYLES[variant] || VARIANT_STYLES.danger;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(15,15,15,0.6)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-6)",
          maxWidth: "28rem",
          width: "90%",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <h3 style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)" }}>{title}</h3>
        <p style={{ margin: "0 0 var(--space-5)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: "var(--space-3)", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "var(--space-2) var(--space-4)",
              background: "var(--bg-elevated)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "var(--space-2) var(--space-4)",
              background: vStyle.bg,
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

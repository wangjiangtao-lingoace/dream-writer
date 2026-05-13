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

export function ConfirmDialog({
  title,
  message,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  variant = "danger",
}: ConfirmDialogProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-card, #fff)",
          border: "1px solid var(--border, #e5e7eb)",
          borderRadius: "var(--radius-md, 8px)",
          padding: "1.5rem",
          maxWidth: "28rem",
          width: "90%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        }}
      >
        <h3 style={{ margin: "0 0 0.5rem", fontSize: "1.125rem", color: "var(--text-primary, #111)" }}>{title}</h3>
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.875rem", color: "var(--text-secondary, #666)", lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: "0.5rem 1rem",
              background: "transparent",
              color: "var(--text-secondary, #666)",
              border: "1px solid var(--border, #e5e7eb)",
              borderRadius: "var(--radius-sm, 4px)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "0.5rem 1rem",
              background: variant === "danger" ? "#dc2626" : "var(--accent, #8b4513)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm, 4px)",
              fontSize: "0.875rem",
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

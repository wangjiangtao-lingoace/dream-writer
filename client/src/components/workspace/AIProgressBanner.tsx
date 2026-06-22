import React from "react";

export interface AIProgressBannerProps {
  /** Progress message text */
  message: string;
  /** Optional progress percentage (0-100) */
  progress?: number | null;
  /** Callback when the "查看详情" button is clicked */
  onDetail: () => void;
}

const AIProgressBanner: React.FC<AIProgressBannerProps> = ({ message, progress, onDetail }) => {
  return (
    <div
      className="ai-progress-banner"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "0.625rem var(--space-6)",
        background: "var(--accent-muted)",
        borderBottom: "1px solid var(--accent-border)",
        fontSize: "var(--text-sm)",
        color: "var(--accent)",
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: "1rem",
          height: "1rem",
          border: "2px solid var(--accent-border)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }}>{message}</span>
      {progress != null && (
        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>
          {progress}%
        </span>
      )}
      <button
        onClick={onDetail}
        style={{
          padding: "var(--space-1) var(--space-3)",
          background: "var(--accent)",
          color: "var(--text-inverse)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-xs)",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        查看详情
      </button>
    </div>
  );
};

export default AIProgressBanner;

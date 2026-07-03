import React, { useState } from "react";

interface PolishDialogProps {
  visible: boolean;
  chapterTitle: string;
  hasReview: boolean;
  onClose: () => void;
  onConfirm: (mode: "review" | "custom", userHint?: string) => void;
  loading: boolean;
}

const PolishDialog: React.FC<PolishDialogProps> = ({
  visible,
  chapterTitle,
  hasReview,
  onClose,
  onConfirm,
  loading,
}) => {
  const [mode, setMode] = useState<"review" | "custom">(hasReview ? "review" : "custom");
  const [userHint, setUserHint] = useState("");

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          borderRadius: "20px",
          padding: "2rem",
          width: "480px",
          maxHeight: "80vh",
          overflow: "auto",
          boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
        }}
      >
        <h3 style={{ margin: "0 0 1.25rem", fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
          润色优化
        </h3>
        <p style={{ margin: "0 0 1.25rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
          章节：{chapterTitle}
        </p>

        {/* 模式选择 */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <button
            onClick={() => setMode("review")}
            disabled={!hasReview}
            style={{
              flex: 1,
              padding: "0.875rem",
              borderRadius: "14px",
              border: `2px solid ${mode === "review" ? "var(--accent)" : "var(--border-default)"}`,
              background: mode === "review" ? "var(--accent-muted)" : "var(--bg-elevated)",
              color: hasReview ? (mode === "review" ? "var(--accent)" : "var(--text-secondary)") : "var(--text-muted)",
              cursor: hasReview ? "pointer" : "not-allowed",
              opacity: hasReview ? 1 : 0.6,
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              根据评审报告润色
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {hasReview ? "AI 将根据评审发现的问题针对性优化" : "暂无评审报告，请先生成评审"}
            </div>
          </button>
          <button
            onClick={() => setMode("custom")}
            style={{
              flex: 1,
              padding: "0.875rem",
              borderRadius: "14px",
              border: `2px solid ${mode === "custom" ? "var(--accent)" : "var(--border-default)"}`,
              background: mode === "custom" ? "var(--accent-muted)" : "var(--bg-elevated)",
              color: mode === "custom" ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.25rem" }}>
              自定义润色要求
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              输入你的具体润色需求
            </div>
          </button>
        </div>

        {/* 自定义输入 */}
        {mode === "custom" && (
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.5rem" }}>
              润色要求
            </label>
            <textarea
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="例如：让对话更口语化、增加环境描写、强化紧张氛围、让主角的内心活动更丰富..."
              rows={4}
              style={{
                width: "100%",
                padding: "0.75rem",
                borderRadius: "12px",
                border: "1px solid var(--border-default)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                lineHeight: 1.6,
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>
        )}

        {/* 评审模式说明 */}
        {mode === "review" && (
          <div
            style={{
              marginBottom: "1.25rem",
              padding: "0.875rem",
              borderRadius: "12px",
              background: "var(--bg-elevated)",
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              lineHeight: 1.6,
            }}
          >
            AI 将根据评审报告中的问题和建议进行针对性优化，重点改进：
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              <li>评审指出的弱项（钩子/剧情/人物/文笔/爽感）</li>
              <li>具体修改建议中提到的问题</li>
              <li>读者反馈中提到的体验问题</li>
            </ul>
          </div>
        )}

        {/* 操作按钮 */}
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "10px",
              border: "1px solid var(--border-default)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "0.875rem",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(mode, userHint)}
            disabled={loading || (mode === "custom" && !userHint.trim())}
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: "10px",
              border: "none",
              background: loading ? "var(--bg-elevated)" : "var(--accent)",
              color: loading ? "var(--text-muted)" : "white",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: loading || (mode === "custom" && !userHint.trim()) ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "润色中..." : "开始润色"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PolishDialog;

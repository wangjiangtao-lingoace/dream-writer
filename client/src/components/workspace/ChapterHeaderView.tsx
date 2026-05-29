import React from "react";

interface ChapterHeaderViewProps {
  breadcrumb: string;
  title: string;
  goals?: string;
  mood?: string;
  wordCount: number;
}

const ChapterHeaderView: React.FC<ChapterHeaderViewProps> = ({ breadcrumb, title, goals, mood, wordCount }) => {
  return (
    <div style={{
      background: "var(--bg-surface)",
      border: "1px solid var(--border-default)",
      borderRadius: "20px",
      padding: "1.25rem 1.5rem",
      marginBottom: "1rem",
      boxShadow: "0 8px 24px rgba(0,0,0,0.04)",
    }}>
      <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
        {breadcrumb}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, letterSpacing: "-0.02em" }}>
          {title}
        </h2>
        <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", flexShrink: 0, marginLeft: "1rem" }}>
          {wordCount.toLocaleString()} 字
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "0.875rem" }}>
        {/* 左列：本章目标 */}
        <div style={{ background: "var(--bg-base)", borderRadius: "14px", padding: "0.875rem", border: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: "0.8125rem", margin: "0 0 0.5rem", fontWeight: 700 }}>本章目标</h3>
          {goals ? (
            <ul style={{ margin: 0, paddingLeft: "1.125rem", color: "var(--text-secondary)", fontSize: "0.8125rem", lineHeight: 1.8 }}>
              {goals.split(/[。；;]/).filter(Boolean).map((g, i) => <li key={i}>{g.trim()}</li>)}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.8125rem" }}>暂无目标</p>
          )}
        </div>
        {/* 右列：核心情绪 */}
        <div style={{ background: "var(--bg-base)", borderRadius: "14px", padding: "0.875rem", border: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: "0.8125rem", margin: "0 0 0.5rem", fontWeight: 700 }}>核心情绪</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.8125rem" }}>{mood || "未设置"}</p>
          <p style={{ marginTop: "0.5rem" }}>
            <span style={{ display: "inline-flex", padding: "0.25rem 0.625rem", borderRadius: "999px", background: "var(--accent-muted)", color: "var(--accent)", fontSize: "0.75rem", fontWeight: 600 }}>
              读者风险：低
            </span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChapterHeaderView;

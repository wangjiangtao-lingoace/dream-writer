import React from "react";

interface WorkspaceTopBarProps {
  novelTitle: string;
  onBack: () => void;
  writingStats: {
    todayWordCount: number;
    targetWordCount: number;
    totalWordCount: number;
    streakDays: number;
    estimatedTime: string;
  };
  signals: {
    mood: string;
    rhythm: string;
    climax: boolean;
  };
  exportButton?: React.ReactNode;
  simpleMode?: boolean;
  onToggleSimpleMode?: () => void;
}

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ minWidth: "80px", textAlign: "center" }}>
    <div style={{ color: "var(--text-muted)", fontSize: "0.6875rem", marginBottom: "0.125rem" }}>{label}</div>
    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{value}</strong>
  </div>
);

const Pill: React.FC<{ color: string; bg: string; children: React.ReactNode }> = ({ color, bg, children }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: "0.375rem",
    padding: "0.375rem 0.625rem", borderRadius: "999px",
    background: bg, color, fontSize: "0.75rem", fontWeight: 600,
  }}>
    {children}
  </span>
);

const WorkspaceTopBar: React.FC<WorkspaceTopBarProps> = ({ novelTitle, onBack, writingStats, signals, exportButton, simpleMode, onToggleSimpleMode }) => {
  const progressPct = writingStats.targetWordCount > 0
    ? Math.min(100, Math.round((writingStats.todayWordCount / writingStats.targetWordCount) * 100))
    : 0;

  return (
    <div className="workspace-topbar-grid" style={{
      display: "grid", gridTemplateColumns: "280px 1fr 420px", alignItems: "center",
      height: "64px", padding: "0 24px", gap: "24px",
      background: "var(--bg-surface)",
      borderBottom: "1px solid var(--border-default)", zIndex: 10,
    }}>
      {/* Left: Brand + Back */}
      <div
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer",
        }}
        className="workspace-topbar-brand"
      >
        <div style={{
          width: "34px", height: "34px", borderRadius: "12px",
          background: "var(--accent)",
          color: "#fff", display: "grid", placeItems: "center",
          fontWeight: 800, fontSize: "0.875rem",
        }}>
          D
        </div>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2 }}>
            {novelTitle}
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>
            返回书架
          </div>
        </div>
      </div>

      {/* Center: Metrics */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1.5rem" }}>
        <Metric label="今日目标" value={`${writingStats.targetWordCount}字`} />
        <div style={{ minWidth: "120px" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.6875rem", marginBottom: "0.25rem" }}>
            已完成 {writingStats.todayWordCount}字 ({progressPct}%)
          </div>
          <div style={{ height: "4px", borderRadius: "999px", background: "var(--bg-elevated)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, borderRadius: "999px", background: "var(--accent)", transition: "width var(--transition-normal)" }} />
          </div>
        </div>
        <Metric label="预计耗时" value={writingStats.estimatedTime} />
        <Metric label="连续创作" value={`${writingStats.streakDays}天`} />
      </div>

      {/* Right: SimpleMode + Export + Signals */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", justifyContent: "flex-end" }}>
        {onToggleSimpleMode && (
          <button
            onClick={onToggleSimpleMode}
            title={simpleMode ? "关闭新手模式" : "开启新手模式"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0.25rem 0.5rem",
              background: simpleMode ? "var(--accent)" : "transparent",
              color: simpleMode ? "var(--text-inverse)" : "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
              whiteSpace: "nowrap",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem" }}>
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
            </svg>
            {simpleMode ? "新手模式" : "标准模式"}
          </button>
        )}
        {exportButton}
        <Pill color="#c2410c" bg="rgba(234,179,8,0.1)">当前情绪：{signals.mood}</Pill>
        <Pill color="#047857" bg="rgba(34,197,94,0.1)">节奏：{signals.rhythm}</Pill>
        <Pill color="var(--accent)" bg="var(--accent-muted)">{signals.climax ? "高潮临近" : "高潮：稳定"}</Pill>
      </div>
    </div>
  );
};

export default WorkspaceTopBar;

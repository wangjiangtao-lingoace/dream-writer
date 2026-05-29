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

const WorkspaceTopBar: React.FC<WorkspaceTopBarProps> = ({ novelTitle, onBack, writingStats, signals }) => {
  const progressPct = writingStats.targetWordCount > 0
    ? Math.min(100, Math.round((writingStats.todayWordCount / writingStats.targetWordCount) * 100))
    : 0;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "280px 1fr 420px", alignItems: "center",
      height: "64px", padding: "0 24px", gap: "24px",
      background: "rgba(255,255,255,0.92)",
      borderBottom: "1px solid var(--border-default)", backdropFilter: "blur(16px)", zIndex: 10,
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
          background: "linear-gradient(135deg, #4f7cff, #8b5cf6)",
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

      {/* Right: Signals */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", justifyContent: "flex-end" }}>
        <Pill color="#c2410c" bg="rgba(234,179,8,0.1)">当前情绪：{signals.mood}</Pill>
        <Pill color="#047857" bg="rgba(34,197,94,0.1)">节奏：{signals.rhythm}</Pill>
        <Pill color="#3159d4" bg="rgba(79,124,255,0.1)">{signals.climax ? "高潮临近" : "高潮：稳定"}</Pill>
      </div>
    </div>
  );
};

export default WorkspaceTopBar;

import React from "react";

const RadarBar: React.FC<{ label: string; value: number; max?: number; color?: string }> = ({
  label, value, max = 100, color = "var(--accent)"
}) => {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ width: "180px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.375rem", color: "var(--text-secondary)" }}>
        <span>{label}</span>
        <strong style={{ color: "var(--text-primary)" }}>{value}</strong>
      </div>
      <div style={{ height: "6px", borderRadius: "999px", background: "var(--bg-elevated)", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, borderRadius: "999px", background: color, transition: "width var(--transition-normal)" }} />
      </div>
    </div>
  );
};

export default RadarBar;

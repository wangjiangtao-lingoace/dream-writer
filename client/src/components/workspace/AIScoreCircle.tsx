import React from "react";

const AIScoreCircle: React.FC<{ score: number; label?: string }> = ({ score, label }) => {
  const pct = Math.min(100, Math.max(0, score * 10));
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <div style={{
        width: "72px", height: "72px", borderRadius: "50%",
        background: `conic-gradient(var(--accent) 0% ${pct}%, var(--bg-elevated) ${pct}% 100%)`,
        display: "grid", placeItems: "center",
        fontWeight: 900, fontSize: "1.25rem", color: "var(--accent)",
      }}>
        {score === 0 ? "--" : score}
      </div>
      {label && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{label}</span>}
    </div>
  );
};

export default AIScoreCircle;

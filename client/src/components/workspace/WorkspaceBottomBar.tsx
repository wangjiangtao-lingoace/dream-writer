import React from "react";
import RadarBar from "./RadarBar";

interface WorkspaceBottomBarProps {
  analysis?: string;
  radarScores: { pleasureDensity: number; emotionWave: number; infoRelease: number };
  nextSuggestion?: string;
}

const WorkspaceBottomBar: React.FC<WorkspaceBottomBarProps> = ({ analysis, radarScores, nextSuggestion }) => {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "280px 1fr 340px", alignItems: "center",
      height: "76px", background: "rgba(255,255,255,0.94)",
      borderTop: "1px solid var(--border-default)", backdropFilter: "blur(16px)",
    }}>
      <div style={{ padding: "0 20px", fontSize: "0.8125rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {analysis || "AI 正在分析..."}
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: "1.25rem" }}>
        <RadarBar label="爽点密度" value={radarScores.pleasureDensity} />
        <RadarBar label="情绪波动" value={radarScores.emotionWave} />
        <RadarBar label="信息释放" value={radarScores.infoRelease} />
      </div>
      <div style={{ padding: "0 20px", fontSize: "0.8125rem", color: "var(--text-secondary)", textAlign: "right" }}>
        {nextSuggestion || "继续创作..."}
      </div>
    </div>
  );
};

export default WorkspaceBottomBar;

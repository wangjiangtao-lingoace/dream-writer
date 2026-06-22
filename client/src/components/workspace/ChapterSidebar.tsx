import React, { useState } from "react";

interface ChapterItem {
  id: string;
  order: number;
  title: string;
  wordCount: number;
  status: string;
  volumeTitle?: string;
  emotion?: string;
  conflict?: string;
}

interface ChapterSidebarProps {
  chapters: ChapterItem[];
  activeChapterId: string | null;
  onSelectChapter: (id: string) => void;
  onCreateChapter: () => void;
  onContinue: () => void;
  continuing?: boolean;
}

const emotionColor = (e?: string) => {
  if (!e) return null;
  const map: Record<string, { bg: string; color: string }> = {
    "压抑": { bg: "rgba(234,179,8,0.1)", color: "#c2410c" },
    "紧张": { bg: "rgba(239,68,68,0.1)", color: "#dc2626" },
    "温馨": { bg: "rgba(34,197,94,0.1)", color: "#047857" },
    "神秘": { bg: "var(--accent-muted)", color: "var(--accent)" },
    "悲壮": { bg: "rgba(107,114,128,0.1)", color: "#374151" },
  };
  return map[e] || { bg: "var(--bg-elevated)", color: "var(--text-secondary)" };
};

const ChapterSidebar: React.FC<ChapterSidebarProps> = ({ chapters, activeChapterId, onSelectChapter, onCreateChapter, onContinue, continuing }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // Group by volume
  const groups = chapters.reduce<Record<string, ChapterItem[]>>((acc, ch) => {
    const vol = ch.volumeTitle || "未分卷";
    (acc[vol] ??= []).push(ch);
    return acc;
  }, {});

  const toggle = (vol: string) => setCollapsed(prev => ({ ...prev, [vol]: !prev[vol] }));

  return (
    <div className="chapter-sidebar" style={{
      width: "280px", background: "var(--bg-surface)",
      borderRight: "1px solid var(--border-default)", overflow: "auto",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ padding: "1rem", borderBottom: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 800, color: "var(--text-primary)" }}>章节结构</span>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          <button onClick={onContinue} disabled={continuing} title="续写下一章" style={{
            width: "1.75rem", height: "1.75rem", borderRadius: "8px",
            background: continuing ? "var(--accent-muted)" : "var(--accent)",
            color: "white", border: "none", cursor: continuing ? "not-allowed" : "pointer",
            fontSize: "0.6875rem", fontWeight: 700, display: "grid", placeItems: "center",
          }}>
            {continuing ? "..." : "续"}
          </button>
          <button onClick={onCreateChapter} style={{
            border: "1px solid var(--border-default)", background: "var(--bg-surface)",
            borderRadius: "8px", padding: "0.375rem 0.5rem", color: "var(--text-muted)", cursor: "pointer",
            display: "grid", placeItems: "center",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: "12px", height: "12px" }}>
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chapter list */}
      <div style={{ flex: 1, padding: "0.5rem" }}>
        {Object.entries(groups).map(([vol, chs]) => (
          <div key={vol}>
            <div onClick={() => toggle(vol)} style={{
              fontSize: "0.6875rem", color: "var(--text-muted)", fontWeight: 700,
              margin: "0.75rem 0 0.375rem", padding: "0 0.5rem", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>{vol}</span>
              <span style={{ fontSize: "0.625rem" }}>{chs.length}章</span>
            </div>
            {!collapsed[vol] && chs.map(ch => {
              const isActive = ch.id === activeChapterId;
              const ec = emotionColor(ch.emotion);
              return (
                <div key={ch.id} onClick={() => onSelectChapter(ch.id)} style={{
                  padding: "0.625rem 0.75rem", borderRadius: "12px", cursor: "pointer",
                  border: `1px solid ${isActive ? "var(--accent-border)" : "transparent"}`,
                  background: isActive ? "var(--accent-subtle)" : "transparent",
                  marginBottom: "0.25rem",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.375rem" }}>
                    <span>{String(ch.order).padStart(3, "0")} {ch.title}</span>
                    <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.75rem" }}>{ch.wordCount > 0 ? `${(ch.wordCount / 1000).toFixed(1)}k` : "未写"}</span>
                  </div>
                  <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                    {ch.emotion && ec && (
                      <span style={{ fontSize: "0.6875rem", padding: "0.125rem 0.375rem", borderRadius: "999px", background: ec.bg, color: ec.color }}>
                        {ch.emotion}
                      </span>
                    )}
                    {ch.conflict && (
                      <span style={{ fontSize: "0.6875rem", padding: "0.125rem 0.375rem", borderRadius: "999px", background: "var(--bg-elevated)", color: "var(--text-secondary)" }}>
                        {ch.conflict}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {chapters.length === 0 && (
          <div style={{ padding: "2rem 1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem" }}>
            还没有章节，点击上方按钮创建
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterSidebar;

import React, { useState } from "react";
import AIScoreCircle from "./AIScoreCircle";
import ChapterRevisionHistory from "../ChapterRevisionHistory";

interface Character { id: string; name: string; role: string; arcSummary?: string; }
interface Worldview { id: string; name: string; summary: string; }
interface Foreshadow { id: string; title: string; status: string; plantChapter?: number; }

interface AssetPanelProps {
  characters: Character[];
  worldviews: Worldview[];
  foreshadows: Foreshadow[];
  aiReview?: { score: number; suggestions: string[] };
  activeChapterId?: string | null;
  onRevisionRollback?: () => void;
}

const TABS = ["AI编辑", "角色", "世界观", "伏笔", "版本"] as const;

const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
  planted: { bg: "rgba(234,179,8,0.1)", color: "#c2410c", label: "已埋" },
  paid_off: { bg: "rgba(34,197,94,0.1)", color: "#047857", label: "已收" },
  expired: { bg: "var(--bg-elevated)", color: "var(--text-muted)", label: "过期" },
};

const AssetPanel: React.FC<AssetPanelProps> = ({ characters, worldviews, foreshadows, aiReview, activeChapterId, onRevisionRollback }) => {
  const [tab, setTab] = useState<number>(0);

  return (
    <div style={{
      width: "340px", background: "var(--bg-surface)",
      borderLeft: "1px solid var(--border-default)", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", padding: "0.875rem 0.875rem 0", position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 2 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            flex: 1, textAlign: "center", fontSize: "0.75rem", padding: "0.5rem 0",
            borderRadius: "10px", fontWeight: 700, cursor: "pointer", border: "none",
            background: tab === i ? "rgba(79,124,255,0.1)" : "transparent",
            color: tab === i ? "#3159d4" : "var(--text-muted)",
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0.875rem" }}>
        {tab === 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <AIScoreCircle score={aiReview?.score ?? 0} label="本章评分" />
            </div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>建议</div>
            {(aiReview?.suggestions || []).map((s, i) => (
              <div key={i} style={{
                padding: "0.625rem", borderRadius: "10px", background: "var(--bg-elevated)",
                fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "0.5rem",
              }}>
                {s}
              </div>
            ))}
            {(!aiReview?.suggestions || aiReview.suggestions.length === 0) && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无 AI 建议</div>
            )}
          </div>
        )}

        {tab === 1 && (
          <div style={{ display: "grid", gap: "0.625rem" }}>
            {characters.map(c => (
              <div key={c.id} style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "0.875rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                  <div style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: "linear-gradient(135deg, #dbeafe, #f5d0fe)",
                    display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.75rem", color: "#4f46e5",
                  }}>
                    {c.name[0]}
                  </div>
                  <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{c.name}</strong>
                  <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{c.role}</span>
                </div>
                {c.arcSummary && (
                  <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    <span>成长推进</span>
                    <strong style={{ color: "var(--accent)" }}>进行中</strong>
                  </div>
                )}
              </div>
            ))}
            {characters.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无角色</div>}
          </div>
        )}

        {tab === 2 && (
          <div style={{ display: "grid", gap: "0.625rem" }}>
            {worldviews.map(w => (
              <div key={w.id} style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "0.875rem" }}>
                <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)", display: "block", marginBottom: "0.25rem" }}>{w.name}</strong>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{w.summary?.slice(0, 120)}</p>
              </div>
            ))}
            {worldviews.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无世界观</div>}
          </div>
        )}

        {tab === 3 && (
          <div style={{ display: "grid", gap: "0.625rem" }}>
            {foreshadows.map(f => {
              const sb = statusBadge[f.status] || statusBadge.planted;
              return (
                <div key={f.id} style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "0.875rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{f.title}</strong>
                    <span style={{ fontSize: "0.6875rem", padding: "0.125rem 0.5rem", borderRadius: "999px", background: sb.bg, color: sb.color, fontWeight: 600 }}>{sb.label}</span>
                  </div>
                  {f.plantChapter && <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>第{f.plantChapter}章埋设</span>}
                </div>
              );
            })}
            {foreshadows.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无伏笔</div>}
          </div>
        )}

        {tab === 4 && (
          activeChapterId ? (
            <ChapterRevisionHistory
              chapterId={activeChapterId}
              onRollback={onRevisionRollback || (() => {})}
            />
          ) : (
            <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>
              请先选择一个章节
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default AssetPanel;

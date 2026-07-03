import React, { useState } from "react";
import AIScoreCircle from "./AIScoreCircle";
import ChapterRevisionHistory from "../ChapterRevisionHistory";

interface Character {
  id: string;
  name: string;
  role: string;
  identity?: string;
  motivation?: string;
  appearance?: string;
  background?: string;
  arcSummary?: string;
  arcDetail?: string;
  speechStyle?: string;
  powerLevel?: string;
  relationsText?: string;
  notes?: string;
  firstAppear?: number | null;
  lastAppear?: number | null;
  appearanceCount?: number | null;
}

interface Worldview {
  id: string;
  name: string;
  summary?: string;
  rules?: string;
  powerSystem?: string;
  geography?: string;
  factions?: string;
  history?: string;
  culture?: string;
  customNotes?: string;
}

interface Foreshadow {
  id: string;
  title: string;
  description?: string;
  status: string;
  plantChapter?: number | null;
  payoffChapter?: number | null;
}

interface AIReviewData {
  overallScore: number;
  dimensions: { hook: number; plot: number; character: number; writing: number; excitement: number };
  comment: string;
  suggestions: Array<{ type: string; severity: string; description: string; suggestion: string }>;
  readerFeedback: Array<{ readerType: string; score: number; comment: string }>;
  commercialPotential: string;
  strengths: string[];
  weaknesses: string[];
  generatedAt?: string;
}

interface AssetPanelProps {
  characters: Character[];
  worldviews: Worldview[];
  foreshadows: Foreshadow[];
  aiReview?: AIReviewData;
  activeChapterId?: string | null;
  onRevisionRollback?: () => void;
  onGenerateReview?: () => void;
  isGeneratingReview?: boolean;
}

const TABS = ["AI编辑", "角色", "世界观", "伏笔", "版本"] as const;

const statusBadge: Record<string, { bg: string; color: string; label: string }> = {
  planted: { bg: "rgba(234,179,8,0.1)", color: "#c2410c", label: "已埋" },
  active: { bg: "rgba(59,130,246,0.1)", color: "#1d4ed8", label: "活跃" },
  payoff_pending: { bg: "rgba(168,85,247,0.1)", color: "#7c3aed", label: "待收" },
  paid_off: { bg: "rgba(34,197,94,0.1)", color: "#047857", label: "已收" },
  expired: { bg: "var(--bg-elevated)", color: "var(--text-muted)", label: "过期" },
};

const AssetPanel: React.FC<AssetPanelProps> = ({ characters, worldviews, foreshadows, aiReview, activeChapterId, onRevisionRollback, onGenerateReview, isGeneratingReview }) => {
  const [tab, setTab] = useState<number>(0);
  const [expandedCharId, setExpandedCharId] = useState<string | null>(null);
  const [expandedWorldId, setExpandedWorldId] = useState<string | null>(null);

  const plantedCount = foreshadows.filter(f => f.status === "planted" || f.status === "active").length;
  const paidOffCount = foreshadows.filter(f => f.status === "paid_off").length;
  const pendingCount = foreshadows.filter(f => f.status === "payoff_pending").length;

  return (
    <div className="asset-panel" style={{
      width: "340px", background: "var(--bg-surface)",
      borderLeft: "1px solid var(--border-default)", display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.25rem", padding: "0.875rem 0.875rem 0", position: "sticky", top: 0, background: "var(--bg-surface)", zIndex: 2 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            flex: 1, textAlign: "center", fontSize: "0.75rem", padding: "0.5rem 0",
            borderRadius: "10px", fontWeight: 700, cursor: "pointer", border: "none",
            background: tab === i ? "var(--accent-muted)" : "transparent",
            color: tab === i ? "var(--accent)" : "var(--text-muted)",
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "0.875rem" }}>
        {tab === 0 && (
          <div>
            {/* 综合评分 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
              <AIScoreCircle score={aiReview?.overallScore ?? 0} label="本章评分" />
            </div>

            {/* 生成按钮 */}
            {!aiReview && onGenerateReview && (
              <button
                onClick={onGenerateReview}
                disabled={isGeneratingReview}
                style={{
                  width: "100%", padding: "0.625rem", borderRadius: "10px", border: "1px solid var(--accent)",
                  background: isGeneratingReview ? "var(--bg-elevated)" : "var(--accent-muted)",
                  color: "var(--accent)", fontSize: "0.8125rem", fontWeight: 600, cursor: isGeneratingReview ? "not-allowed" : "pointer",
                  marginBottom: "1rem",
                }}
              >
                {isGeneratingReview ? "评审生成中..." : "生成 AI 评审"}
              </button>
            )}

            {/* 五维评分 */}
            {aiReview?.dimensions && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>五维评分</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.375rem" }}>
                  {[
                    { key: "hook", label: "钩子效果" },
                    { key: "plot", label: "剧情推进" },
                    { key: "character", label: "人物塑造" },
                    { key: "writing", label: "文笔质量" },
                    { key: "excitement", label: "爽感指数" },
                  ].map(({ key, label }) => (
                    <div key={key} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "0.375rem 0.625rem", borderRadius: "8px", background: "var(--bg-elevated)",
                      fontSize: "0.75rem",
                    }}>
                      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
                      <strong style={{
                        color: (aiReview.dimensions as any)[key] >= 7 ? "#059669" :
                          (aiReview.dimensions as any)[key] >= 5 ? "#d97706" : "#dc2626",
                      }}>
                        {(aiReview.dimensions as any)[key]}/10
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 总体评价 */}
            {aiReview?.comment && (
              <div style={{
                padding: "0.625rem", borderRadius: "10px", background: "var(--bg-elevated)",
                fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "1rem",
                borderLeft: "3px solid var(--accent)",
              }}>
                {aiReview.comment}
              </div>
            )}

            {/* 读者反馈 */}
            {aiReview?.readerFeedback && aiReview.readerFeedback.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>读者视角</div>
                {aiReview.readerFeedback.map((rf, i) => (
                  <div key={i} style={{
                    padding: "0.5rem", borderRadius: "8px", background: "var(--bg-elevated)",
                    marginBottom: "0.375rem", fontSize: "0.75rem",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                      <span style={{ color: "var(--accent)", fontWeight: 600 }}>{rf.readerType}</span>
                      <span style={{ color: rf.score >= 7 ? "#059669" : "#d97706" }}>{rf.score}/10</span>
                    </div>
                    <div style={{ color: "var(--text-secondary)", lineHeight: 1.5 }}>{rf.comment}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 优缺点 */}
            {((aiReview?.strengths?.length ?? 0) > 0 || (aiReview?.weaknesses?.length ?? 0) > 0) && (
              <div style={{ marginBottom: "1rem" }}>
                {(aiReview?.strengths?.length ?? 0) > 0 && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#059669", marginBottom: "0.25rem" }}>优点</div>
                    {aiReview?.strengths?.map((s, i) => (
                      <div key={i} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", paddingLeft: "0.5rem", borderLeft: "2px solid #059669", marginBottom: "0.25rem" }}>{s}</div>
                    ))}
                  </div>
                )}
                {(aiReview?.weaknesses?.length ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#dc2626", marginBottom: "0.25rem" }}>待改进</div>
                    {aiReview?.weaknesses?.map((w, i) => (
                      <div key={i} style={{ fontSize: "0.75rem", color: "var(--text-secondary)", paddingLeft: "0.5rem", borderLeft: "2px solid #dc2626", marginBottom: "0.25rem" }}>{w}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 商业潜力 */}
            {aiReview?.commercialPotential && (
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>商业潜力</div>
                <div style={{
                  padding: "0.5rem", borderRadius: "8px", background: "var(--bg-elevated)",
                  fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5,
                }}>
                  {aiReview.commercialPotential}
                </div>
              </div>
            )}

            {/* 具体建议 */}
            {aiReview?.suggestions && aiReview.suggestions.length > 0 && (
              <div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>修改建议</div>
                {aiReview.suggestions.map((s, i) => (
                  <div key={i} style={{
                    padding: "0.625rem", borderRadius: "10px", background: "var(--bg-elevated)",
                    marginBottom: "0.5rem",
                  }}>
                    <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.25rem" }}>
                      <span style={{
                        fontSize: "0.625rem", padding: "0.125rem 0.375rem", borderRadius: "4px",
                        background: s.severity === "high" ? "rgba(220,38,38,0.1)" : s.severity === "medium" ? "rgba(217,119,6,0.1)" : "rgba(59,130,246,0.1)",
                        color: s.severity === "high" ? "#dc2626" : s.severity === "medium" ? "#d97706" : "#2563eb",
                      }}>
                        {s.severity === "high" ? "高" : s.severity === "medium" ? "中" : "低"}
                      </span>
                      <span style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>{s.type}</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", marginBottom: "0.25rem" }}>{s.description}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--accent)" }}>{s.suggestion}</div>
                  </div>
                ))}
              </div>
            )}

            {/* 重新生成按钮 */}
            {aiReview && onGenerateReview && (
              <button
                onClick={onGenerateReview}
                disabled={isGeneratingReview}
                style={{
                  width: "100%", padding: "0.5rem", borderRadius: "10px", border: "1px solid var(--border-default)",
                  background: "transparent", color: "var(--text-muted)", fontSize: "0.75rem",
                  cursor: isGeneratingReview ? "not-allowed" : "pointer", marginTop: "0.5rem",
                }}
              >
                {isGeneratingReview ? "重新生成中..." : "重新评审"}
              </button>
            )}

            {/* 无数据提示 */}
            {!aiReview && !onGenerateReview && (
              <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无 AI 评审</div>
            )}
          </div>
        )}

        {tab === 1 && (
          <div style={{ display: "grid", gap: "0.625rem" }}>
            {characters.map(c => {
              const isExpanded = expandedCharId === c.id;
              return (
                <div key={c.id} style={{
                  border: "1px solid var(--border-default)", borderRadius: "14px", padding: "0.875rem",
                  cursor: "pointer", transition: "all 0.15s",
                }}
                  onClick={() => setExpandedCharId(isExpanded ? null : c.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
                    <div style={{
                      width: "28px", height: "28px", borderRadius: "50%",
                      background: "var(--bg-elevated)",
                      display: "grid", placeItems: "center", fontWeight: 800, fontSize: "0.75rem", color: "#4f46e5",
                    }}>
                      {c.name[0]}
                    </div>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{c.name}</strong>
                    <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>{c.role}</span>
                    <span style={{ marginLeft: "auto", fontSize: "0.625rem", color: "var(--text-muted)" }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                  {!isExpanded && c.arcSummary && (
                    <div style={{ marginTop: "0.5rem", display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      <span>成长推进</span>
                      <strong style={{ color: "var(--accent)" }}>{c.arcSummary.slice(0, 20)}</strong>
                    </div>
                  )}
                  {isExpanded && (
                    <div style={{ marginTop: "0.5rem" }}>
                      {c.identity && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>身份背景</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>{c.identity}</div>
                        </div>
                      )}
                      {c.motivation && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>核心动机</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>{c.motivation}</div>
                        </div>
                      )}
                      {c.appearance && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>外貌描述</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.appearance}</div>
                        </div>
                      )}
                      {c.background && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>人物背景</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.background}</div>
                        </div>
                      )}
                      {c.relationsText && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>人物关系</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.relationsText}</div>
                        </div>
                      )}
                      {c.arcDetail && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>角色弧线</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.arcDetail}</div>
                        </div>
                      )}
                      {c.speechStyle && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>言语风格</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>{c.speechStyle}</div>
                        </div>
                      )}
                      {c.powerLevel && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>战力等级</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>{c.powerLevel}</div>
                        </div>
                      )}
                      {c.notes && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>备注</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>{c.notes}</div>
                        </div>
                      )}
                      {(c.firstAppear != null || c.lastAppear != null || (c.appearanceCount != null && c.appearanceCount > 0)) && (
                        <div style={{ marginBottom: "0.5rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                          {c.firstAppear != null && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>首次：第{c.firstAppear}章</span>
                          )}
                          {c.lastAppear != null && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>最后：第{c.lastAppear}章</span>
                          )}
                          {c.appearanceCount != null && c.appearanceCount > 0 && (
                            <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>出场{c.appearanceCount}次</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {characters.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无角色</div>}
          </div>
        )}

        {tab === 2 && (
          <div style={{ display: "grid", gap: "0.625rem" }}>
            {worldviews.map(w => {
              const isExpanded = expandedWorldId === w.id;
              return (
                <div key={w.id} style={{
                  border: "1px solid var(--border-default)", borderRadius: "14px", padding: "0.875rem",
                  cursor: "pointer", transition: "all 0.15s",
                }}
                  onClick={() => setExpandedWorldId(isExpanded ? null : w.id)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{w.name}</strong>
                    <span style={{ fontSize: "0.625rem", color: "var(--text-muted)" }}>{isExpanded ? "▲" : "▼"}</span>
                  </div>
                  {!isExpanded && w.summary && (
                    <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{w.summary.slice(0, 120)}</p>
                  )}
                  {isExpanded && (
                    <div style={{ marginTop: "0.5rem" }}>
                      {w.summary && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>概述</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.summary}</div>
                        </div>
                      )}
                      {w.rules && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>世界规则</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.rules}</div>
                        </div>
                      )}
                      {w.powerSystem && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>力量体系</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.powerSystem}</div>
                        </div>
                      )}
                      {w.geography && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>地理环境</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.geography}</div>
                        </div>
                      )}
                      {w.factions && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>势力阵营</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.factions}</div>
                        </div>
                      )}
                      {w.history && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>历史背景</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.history}</div>
                        </div>
                      )}
                      {w.culture && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>文化习俗</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.culture}</div>
                        </div>
                      )}
                      {w.customNotes && (
                        <div style={{ marginBottom: "0.5rem" }}>
                          <div style={{ fontSize: "0.6875rem", color: "var(--text-muted)", marginBottom: "0.125rem" }}>自定义备注</div>
                          <div style={{ fontSize: "0.75rem", color: "var(--text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{w.customNotes}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {worldviews.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无世界观</div>}
          </div>
        )}

        {tab === 3 && (
          <div>
            {/* Foreshadow stats */}
            {foreshadows.length > 0 && (
              <div style={{
                display: "flex", gap: "0.5rem", marginBottom: "0.75rem", padding: "0.625rem",
                background: "var(--bg-elevated)", borderRadius: "10px", fontSize: "0.6875rem",
              }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "var(--text-muted)" }}>已埋</div>
                  <strong style={{ color: "#c2410c" }}>{plantedCount}</strong>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "var(--text-muted)" }}>待收</div>
                  <strong style={{ color: "#7c3aed" }}>{pendingCount}</strong>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "var(--text-muted)" }}>已收</div>
                  <strong style={{ color: "#047857" }}>{paidOffCount}</strong>
                </div>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ color: "var(--text-muted)" }}>回收率</div>
                  <strong style={{ color: "var(--accent)" }}>
                    {plantedCount + paidOffCount > 0 ? Math.round((paidOffCount / (plantedCount + paidOffCount)) * 100) : 0}%
                  </strong>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gap: "0.625rem" }}>
              {foreshadows.map(f => {
                const sb = statusBadge[f.status] || statusBadge.planted;
                return (
                  <div key={f.id} style={{ border: "1px solid var(--border-default)", borderRadius: "14px", padding: "0.875rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                      <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{f.title}</strong>
                      <span style={{ fontSize: "0.6875rem", padding: "0.125rem 0.5rem", borderRadius: "999px", background: sb.bg, color: sb.color, fontWeight: 600 }}>{sb.label}</span>
                    </div>
                    {f.description && (
                      <p style={{ margin: "0.25rem 0", fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                        {f.description.length > 80 ? f.description.slice(0, 80) + "..." : f.description}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.375rem" }}>
                      {f.plantChapter != null && (
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-muted)" }}>第{f.plantChapter}章埋设</span>
                      )}
                      {f.payoffChapter != null && (
                        <span style={{ fontSize: "0.6875rem", color: "#047857" }}>第{f.payoffChapter}章回收</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {foreshadows.length === 0 && <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "0.8125rem", padding: "1.5rem 0" }}>暂无伏笔</div>}
            </div>
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

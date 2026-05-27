import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { translateChapterSource, translateAdoptionKey, translateAdoptionValue, translateAssetType } from "../../utils/translate";
import BlueprintViewer from "./BlueprintViewer";

interface WorkflowStatus {
  novel: { id: string; title: string; genre: string | null; inspiration: string | null; outline: string | null; coverImage: string | null; status: string; chapters: any[]; characters: any[]; worldId: string | null };
  bookAnalysis: null | {
    id: string;
    title: string;
    status: string;
    sectionTotal: number;
    sectionCompleted: number;
    usedForImitation: number;
    materialized: boolean;
    sourceTitle?: string | null;
  };
  imitation: null | {
    id: string;
    title: string;
    status: string;
    hasBlueprint: boolean;
    hasChapterTemplate: boolean;
    sampleDraftCount: number;
    materialized: boolean;
    pipelineJobId?: string | null;
  };
  assets: Record<string, number>;
  adoption: Record<string, string>;
  chapters: {
    total: number;
    drafted: number;
    firstThree: Array<{ id?: string; order: number; title: string; status: string; source?: string | null; wordCount: number; hasContent: boolean }>;
  };
  pipeline: null | { id: string; status: string; currentPhase: string; currentStep: string; progress: number };
  usage: { countsByType: Record<string, number>; recent: Array<{ id: string; assetType: string; title: string; usageStage: string; createdAt: string }> };
  nextActions: Array<{ key: string; label: string; enabled: boolean; reason: string; imitationPlanId?: string | null }>;
  creationMode?: "standalone" | "imitation";
  health: { missing: string[]; warnings: string[] };
}

const DashboardPanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, [novelId]);

  async function loadStatus() {
    try {
      setLoading(true);
      setStatus(await api.get<WorkflowStatus>(`/api/novels/${novelId}/workflow-status`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "流程状态加载失败。");
    } finally {
      setLoading(false);
    }
  }

  async function runDraft(planId?: string | null) {
    if (!planId) {
      navigate(`/novel/${novelId}/analysis`);
      return;
    }
    setNotice("正在启动自动创作：会生成蓝图、章纲和 1-3 章，已有正文默认不覆盖。");
    await api.post(`/api/imitation-plans/${planId}/apply-to-pipeline`, {
      autoContinue: true,
      autoDraftChapters: 3,
      volumeCount: 1,
      chaptersPerVolume: 3,
      targetWordCount: 1800,
      sourcePolicy: "verified_only",
      overwriteExistingChapters: false,
    });
    navigate(`/novel/${novelId}/pipeline`);
  }

  const handleAction = async (action: WorkflowStatus["nextActions"][number]) => {
    if (action.key === "analysis" || action.key === "imitation") {
      navigate(`/novel/${novelId}/analysis`);
      return;
    }
    if (action.key === "standalone") {
      setNotice("正在从灵感生成大纲，请稍候...");
      try {
        await api.post("/api/pipeline/start", {
          novelId,
          config: { mode: "standalone", autoDraftChapters: 3 },
        });
        navigate(`/novel/${novelId}/pipeline`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "启动生成流程失败。");
      }
      return;
    }
    if (action.key === "draft") {
      await runDraft(action.imitationPlanId);
      return;
    }
    if (action.key === "continue") {
      navigate(`/novel/${novelId}/write`);
    }
  };

  if (loading) return <div className="panel-loading">加载创作总控台...</div>;
  if (!status) return <div className="empty-state">{notice || "无法加载创作流程状态。"}</div>;

  const isStandalone = status.creationMode === "standalone";
  const cards = isStandalone
    ? [
        { label: "灵感", value: status.novel.inspiration ? "已填写" : "未填写", text: status.novel.inspiration ? status.novel.inspiration.slice(0, 40) + (status.novel.inspiration.length > 40 ? "..." : "") : "请先填写创作灵感" },
        { label: "资产", value: `${status.assets.characters || 0}人物/${status.assets.worldviews || 0}世界观`, text: `风格 ${status.assets.styleProfiles || 0}，钩子 ${status.assets.hooks || 0}，卷纲 ${status.assets.volumes || 0}` },
        { label: "章节", value: `${status.chapters.drafted}/${status.chapters.total}`, text: `前三章：${status.chapters.firstThree.map((chapter) => chapter.hasContent ? "有" : "缺").join(" / ")}` },
        { label: "流程", value: status.pipeline ? (status.pipeline.status === "running" ? "运行中" : status.pipeline.status === "paused" ? "已暂停" : status.pipeline.status) : "未启动", text: status.pipeline ? `进度 ${status.pipeline.progress}%` : "点击下方按钮启动" },
      ]
    : [
        { label: "拆书", value: status.bookAnalysis ? `${status.bookAnalysis.sectionCompleted}/${status.bookAnalysis.sectionTotal}` : "未开始", text: status.bookAnalysis ? `${status.bookAnalysis.usedForImitation} 个分区用于仿写` : "需要资料或粘贴内容" },
        { label: "仿写", value: status.imitation ? "已生成" : "缺失", text: status.imitation ? `样章 ${status.imitation.sampleDraftCount} 个，${status.imitation.materialized ? "已落库" : "未落库"}` : "需要先完成拆书" },
        { label: "资产", value: `${status.assets.knowledgeAssets || 0}/${status.assets.memories || 0}`, text: `知识库 / 记忆，人物 ${status.assets.characters || 0}，世界观 ${status.assets.worldviews || 0}` },
        { label: "章节", value: `${status.chapters.drafted}/${status.chapters.total}`, text: `前三章：${status.chapters.firstThree.map((chapter) => chapter.hasContent ? "有" : "缺").join(" / ")}` },
      ];

  return (
    <div className="workflow-dashboard" style={{ display: "grid", gap: "1.25rem" }}>
      <div className="panel-header">
        <h2>创作总控台</h2>
        <p className="panel-desc">{isStandalone ? "独立创作：灵感 → AI 自动生成大纲、人物、世界观、风格、章节。" : "主路径：资料 → 拆书 → 仿写蓝图 → 资产落库 → 自动生成 1-3 章 → 继续创作。"}</p>
      </div>

      {notice && <div className="notice-bar" style={{ padding: "0.75rem 1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", color: "var(--accent)", background: "var(--accent-muted)" }}>{notice}</div>}

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "1rem" }}>
        {cards.map((card) => (
          <article key={card.label} style={{ padding: "1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-surface)" }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>{card.label}</div>
            <strong style={{ display: "block", marginTop: "0.375rem", fontSize: "1.5rem", color: "var(--text-primary)" }}>{card.value}</strong>
            <p style={{ margin: "0.375rem 0 0", fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>{card.text}</p>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "1rem" }}>
        <article style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-base)", overflow: "hidden" }}>
          <h3 style={{ margin: 0, padding: "0.875rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "1rem" }}>下一步动作</h3>
          <div style={{ display: "grid", gap: "0.75rem", padding: "1rem" }}>
            {status.nextActions.map((action) => (
              <button
                key={action.key}
                disabled={!action.enabled}
                onClick={() => handleAction(action)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px 1fr",
                  gap: "1rem",
                  alignItems: "center",
                  padding: "0.875rem 1rem",
                  textAlign: "left",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  background: action.enabled ? "var(--bg-surface)" : "var(--border-light)",
                  color: action.enabled ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: action.enabled ? "pointer" : "not-allowed",
                }}
              >
                <strong>{action.label}</strong>
                <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{action.reason}</span>
              </button>
            ))}
          </div>
        </article>

        <article style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-base)", overflow: "hidden" }}>
          <h3 style={{ margin: 0, padding: "0.875rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "1rem" }}>资产采用状态</h3>
          <div style={{ padding: "1rem", display: "grid", gap: "0.75rem" }}>
            {Object.entries(status.adoption).map(([key, value]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.875rem" }}>
                <span style={{ color: "var(--text-secondary)" }}>{translateAdoptionKey(key)}</span>
                <strong style={{ color: value.includes("Pipeline") ? "var(--accent)" : "var(--text-primary)" }}>{translateAdoptionValue(value)}</strong>
              </div>
            ))}
            {status.health.missing.length > 0 && (
              <div style={{ marginTop: "0.5rem", padding: "0.75rem", borderRadius: "var(--radius-sm)", background: "rgba(220,53,69,0.08)", color: "#b42318", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                缺失项：{status.health.missing.join("、")}
              </div>
            )}
          </div>
        </article>
      </section>

      <section style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-base)", overflow: "hidden" }}>
        <h3 style={{ margin: 0, padding: "0.875rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "1rem" }}>任务关系图</h3>
        <div style={{ padding: "1rem" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1rem",
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)",
            marginBottom: "0.75rem",
            fontSize: "0.8125rem",
            color: "var(--text-secondary)",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            当前创作流程节点与依赖关系
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "0.75rem",
          }}>
            {isStandalone ? (
              <>
                {/* 独立创作：灵感节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: status.novel.inspiration ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${status.novel.inspiration ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: status.novel.inspiration ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>1</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>创作灵感</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {status.novel.inspiration ? "已填写" : "请填写灵感"}
                  </p>
                  <div style={{ position: "absolute", right: "-0.75rem", top: "50%", transform: "translateY(-50%)", width: "1.5rem", height: "2px", background: "var(--border-default)" }} />
                </div>

                {/* 独立创作：AI 规划节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: (status.assets.characters > 0 && status.assets.worldviews > 0) ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${(status.assets.characters > 0 && status.assets.worldviews > 0) ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: (status.assets.characters > 0 && status.assets.worldviews > 0) ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>2</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>AI 规划</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    大纲/人物/世界观/风格
                  </p>
                  <div style={{ position: "absolute", right: "-0.75rem", top: "50%", transform: "translateY(-50%)", width: "1.5rem", height: "2px", background: "var(--border-default)" }} />
                </div>

                {/* 独立创作：章节创作节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: status.chapters.drafted > 0 ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${status.chapters.drafted > 0 ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: status.chapters.drafted > 0 ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>3</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>章节创作</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {status.chapters.drafted > 0 ? `${status.chapters.drafted}/${status.chapters.total} 章` : "自动生成 1-3 章"}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* 仿写模式：资料节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: status.bookAnalysis ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${status.bookAnalysis ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: status.bookAnalysis ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>1</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>资料收集</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {status.bookAnalysis ? "已完成" : "准备参考文本"}
                  </p>
                  <div style={{ position: "absolute", right: "-0.75rem", top: "50%", transform: "translateY(-50%)", width: "1.5rem", height: "2px", background: "var(--border-default)" }} />
                </div>

                {/* 仿写模式：拆书节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: status.bookAnalysis?.status === "succeeded" ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${status.bookAnalysis?.status === "succeeded" ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: status.bookAnalysis?.status === "succeeded" ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>2</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>拆书分析</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {status.bookAnalysis ? `${status.bookAnalysis.sectionCompleted}/${status.bookAnalysis.sectionTotal} 分区` : "8 个维度分析"}
                  </p>
                  <div style={{ position: "absolute", right: "-0.75rem", top: "50%", transform: "translateY(-50%)", width: "1.5rem", height: "2px", background: "var(--border-default)" }} />
                </div>

                {/* 仿写模式：仿写节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: status.imitation ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${status.imitation ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                  position: "relative",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: status.imitation ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>3</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>仿写方案</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {status.imitation ? `${status.imitation.sampleDraftCount} 个样章` : "蓝图 + 样章"}
                  </p>
                  <div style={{ position: "absolute", right: "-0.75rem", top: "50%", transform: "translateY(-50%)", width: "1.5rem", height: "2px", background: "var(--border-default)" }} />
                </div>

                {/* 仿写模式：创作节点 */}
                <div style={{
                  padding: "0.75rem",
                  background: status.chapters.drafted > 0 ? "rgba(40,167,69,0.1)" : "var(--bg-surface)",
                  border: `1px solid ${status.chapters.drafted > 0 ? "#28a745" : "var(--border-default)"}`,
                  borderRadius: "var(--radius-sm)",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: "1.5rem", height: "1.5rem",
                      background: status.chapters.drafted > 0 ? "#28a745" : "var(--text-muted)",
                      color: "var(--text-inverse)", borderRadius: "50%", fontSize: "0.75rem", fontWeight: 600,
                    }}>4</span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>章节创作</strong>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {status.chapters.drafted > 0 ? `${status.chapters.drafted}/${status.chapters.total} 章` : "自动生成 1-3 章"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* 流程进度条 */}
          <div style={{
            marginTop: "1rem",
            padding: "0.75rem",
            background: "var(--bg-surface)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-default)",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
            }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>整体进度</span>
              <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                {Math.round(
                  ((status.bookAnalysis ? 25 : 0) +
                    (status.bookAnalysis?.status === "succeeded" ? 25 : 0) +
                    (status.imitation ? 25 : 0) +
                    (status.chapters.drafted > 0 ? 25 : 0))
                )}%
              </span>
            </div>
            <div style={{
              height: "0.5rem",
              background: "var(--border-default)",
              borderRadius: "var(--radius-full)",
              overflow: "hidden",
            }}>
              <div style={{
                height: "100%",
                width: `${Math.round(
                  ((status.bookAnalysis ? 25 : 0) +
                    (status.bookAnalysis?.status === "succeeded" ? 25 : 0) +
                    (status.imitation ? 25 : 0) +
                    (status.chapters.drafted > 0 ? 25 : 0))
                )}%`,
                background: "var(--accent)",
                borderRadius: "var(--radius-full)",
                transition: "width var(--transition-normal)",
              }} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", background: "var(--bg-base)", overflow: "hidden" }}>
        <h3 style={{ margin: 0, padding: "0.875rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "1rem" }}>成果与使用记录</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", padding: "1rem" }}>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {status.chapters.firstThree.map((chapter) => (
              <div key={chapter.order} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.625rem 0", borderBottom: "1px solid var(--border-light)" }}>
                <span>第{chapter.order}章 {chapter.title}</span>
                <strong>{chapter.hasContent ? `${chapter.wordCount}字 · ${translateChapterSource(chapter.source || "manual").label}` : "未生成"}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: "0.5rem", maxHeight: "180px", overflow: "auto" }}>
            {status.usage.recent.slice(0, 8).map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.8125rem" }}>
                <span>{item.title}</span>
                <em style={{ fontStyle: "normal", color: "var(--text-muted)" }}>{translateAssetType(item.assetType)}</em>
              </div>
            ))}
            {status.usage.recent.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.875rem" }}>还没有 Pipeline 使用记录。</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPanel;

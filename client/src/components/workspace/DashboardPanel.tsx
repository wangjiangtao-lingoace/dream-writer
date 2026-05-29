import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { translateChapterSource, translateAdoptionKey, translateAdoptionValue, translateAssetType, translatePipelineStatus } from "../../utils/translate";
import "../../styles/components/dashboard.css";

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
  creationMode?: "standalone" | "imitation" | "continue";
  health: { missing: string[]; warnings: string[] };
}

const DashboardPanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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
      setActionLoading(action.key);
      setNotice("正在从灵感生成大纲，请稍候...");
      try {
        await api.post("/api/pipeline/start", {
          novelId,
          config: { mode: "standalone", autoDraftChapters: 3 },
        });
        navigate(`/novel/${novelId}/pipeline`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "启动生成流程失败。");
      } finally {
        setActionLoading(null);
      }
      return;
    }
    if (action.key === "draft") {
      setActionLoading(action.key);
      try {
        await runDraft(action.imitationPlanId);
      } finally {
        setActionLoading(null);
      }
      return;
    }
    if (action.key === "continue") {
      setActionLoading(action.key);
      setNotice("正在启动智能续写流程...");
      try {
        await api.post("/api/pipeline/start", {
          novelId,
          config: { mode: "continue", autoDraftChapters: 3 },
        });
        navigate(`/novel/${novelId}/pipeline`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "启动续写流程失败。");
      } finally {
        setActionLoading(null);
      }
    }
  };

  if (loading) return <div className="panel-loading">加载创作总控台...</div>;
  if (!status) return <div className="empty-state">{notice || "无法加载创作流程状态。"}</div>;

  const isStandalone = status.creationMode === "standalone";
  const isContinue = status.creationMode === "continue";
  const cards = isStandalone
    ? [
        { label: "灵感", value: status.novel.inspiration ? "已填写" : "未填写", text: status.novel.inspiration ? status.novel.inspiration.slice(0, 40) + (status.novel.inspiration.length > 40 ? "..." : "") : "请先填写创作灵感" },
        { label: "资产", value: `${status.assets.characters || 0}人物/${status.assets.worldviews || 0}世界观`, text: `风格 ${status.assets.styleProfiles || 0}，钩子 ${status.assets.hooks || 0}，卷纲 ${status.assets.volumes || 0}` },
        { label: "章节", value: `${status.chapters.drafted}/${status.chapters.total}`, text: `前三章：${status.chapters.firstThree.map((chapter) => chapter.hasContent ? "有" : "缺").join(" / ")}` },
        { label: "流程", value: status.pipeline ? translatePipelineStatus(status.pipeline.status).label : "未启动", text: status.pipeline ? `进度 ${status.pipeline.progress}%` : "点击下方按钮启动" },
      ]
    : isContinue
    ? [
        { label: "已有章节", value: `${status.chapters.drafted} 章`, text: `${status.chapters.total} 章规划，${status.chapters.drafted} 章已有正文` },
        { label: "资产", value: `${status.assets.characters || 0}人物/${status.assets.worldviews || 0}世界观`, text: `风格 ${status.assets.styleProfiles || 0}，钩子 ${status.assets.hooks || 0}，卷纲 ${status.assets.volumes || 0}` },
        { label: "章节", value: `${status.chapters.drafted}/${status.chapters.total}`, text: `前三章：${status.chapters.firstThree.map((chapter) => chapter.hasContent ? "有" : "缺").join(" / ")}` },
        { label: "流程", value: status.pipeline ? translatePipelineStatus(status.pipeline.status).label : "未启动", text: status.pipeline ? `进度 ${status.pipeline.progress}%` : "点击下方按钮启动" },
      ]
    : [
        { label: "拆书", value: status.bookAnalysis ? `${status.bookAnalysis.sectionCompleted}/${status.bookAnalysis.sectionTotal}` : "未开始", text: status.bookAnalysis ? `${status.bookAnalysis.usedForImitation} 个分区用于仿写` : "需要资料或粘贴内容" },
        { label: "仿写", value: status.imitation ? "已生成" : "缺失", text: status.imitation ? `样章 ${status.imitation.sampleDraftCount} 个，${status.imitation.materialized ? "已落库" : "未落库"}` : "需要先完成拆书" },
        { label: "资产", value: `${status.assets.knowledgeAssets || 0}/${status.assets.memories || 0}`, text: `知识库 / 记忆，人物 ${status.assets.characters || 0}，世界观 ${status.assets.worldviews || 0}` },
        { label: "章节", value: `${status.chapters.drafted}/${status.chapters.total}`, text: `前三章：${status.chapters.firstThree.map((chapter) => chapter.hasContent ? "有" : "缺").join(" / ")}` },
      ];

  return (
    <div className="workflow-dashboard">
      <div className="panel-header">
        <h2>创作总控台</h2>
        <p className="panel-desc">{isStandalone ? "独立创作：灵感 → AI 自动生成大纲、人物、世界观、风格、章节。" : isContinue ? "智能续写：已有章节 → 提取资产 → 规划卷纲章纲 → 每个阶段可确认调整 → 继续创作。" : "主路径：资料 → 拆书 → 仿写蓝图 → 资产落库 → 自动生成 1-3 章 → 继续创作。"}</p>
      </div>

      {notice && <div className="dashboard-notice">{notice}</div>}

      <section className="dashboard-cards-grid">
        {cards.map((card) => (
          <article key={card.label} className="dashboard-card">
            <div className="dashboard-card-label">{card.label}</div>
            <strong className="dashboard-card-value">{card.value}</strong>
            <p className="dashboard-card-text">{card.text}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-two-col">
        <article className="dashboard-section">
          <h3 className="dashboard-section-header">下一步动作</h3>
          <div className="dashboard-actions-grid">
            {status.nextActions.map((action) => {
              const isContinueAction = action.key === "continue" && action.enabled;
              return (
                <button
                  key={action.key}
                  disabled={!action.enabled || actionLoading !== null}
                  onClick={() => handleAction(action)}
                  className={`dashboard-action-btn${isContinueAction ? " dashboard-action-btn--continue" : ""}`}
                >
                  <strong>{actionLoading === action.key ? "启动中..." : action.label}</strong>
                  <span className={`dashboard-action-reason${isContinueAction ? " dashboard-action-reason--continue" : ""}`}>{action.reason}</span>
                </button>
              );
            })}
          </div>
        </article>

        <article className="dashboard-section">
          <h3 className="dashboard-section-header">资产采用状态</h3>
          <div className="dashboard-adoption-body">
            {Object.entries(status.adoption).map(([key, value]) => (
              <div key={key} className="adoption-row">
                <span className="adoption-key">{translateAdoptionKey(key)}</span>
                <strong className={`adoption-value${value.includes("流水线") ? " adoption-value--accent" : ""}`}>{translateAdoptionValue(value)}</strong>
              </div>
            ))}
            {status.health.missing.length > 0 && (
              <div className="dashboard-warning">
                缺失项：{status.health.missing.join("、")}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-section">
        <h3 className="dashboard-section-header">任务关系图</h3>
        <div style={{ padding: "1rem" }}>
          <div className="flow-graph-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            当前创作流程节点与依赖关系
          </div>
          <div className="flow-graph">
            {isStandalone ? (
              <>
                {/* 独立创作：灵感节点 */}
                <div className={`flow-node${status.novel.inspiration ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.novel.inspiration ? " flow-node-badge--done" : ""}`}>1</span>
                    <strong className="flow-node-title">创作灵感</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.novel.inspiration ? "已填写" : "请填写灵感"}
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 独立创作：AI 规划节点 */}
                <div className={`flow-node${status.assets.characters > 0 && status.assets.worldviews > 0 ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.assets.characters > 0 && status.assets.worldviews > 0 ? " flow-node-badge--done" : ""}`}>2</span>
                    <strong className="flow-node-title">AI 规划</strong>
                  </div>
                  <p className="flow-node-desc">
                    大纲/人物/世界观/风格
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 独立创作：章节创作节点 */}
                <div className={`flow-node${status.chapters.drafted > 0 ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.chapters.drafted > 0 ? " flow-node-badge--done" : ""}`}>3</span>
                    <strong className="flow-node-title">章节创作</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.chapters.drafted > 0 ? `${status.chapters.drafted}/${status.chapters.total} 章` : "自动生成 1-3 章"}
                  </p>
                </div>
              </>
            ) : isContinue ? (
              <>
                {/* 续写模式：已有章节节点 */}
                <div className={`flow-node${status.chapters.drafted > 0 ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.chapters.drafted > 0 ? " flow-node-badge--done" : ""}`}>1</span>
                    <strong className="flow-node-title">已有章节</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.chapters.drafted > 0 ? `${status.chapters.drafted} 章已有正文` : "暂无章节"}
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 续写模式：分析提取节点 */}
                <div className={`flow-node${status.assets.characters > 0 && status.assets.worldviews > 0 ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.assets.characters > 0 && status.assets.worldviews > 0 ? " flow-node-badge--done" : ""}`}>2</span>
                    <strong className="flow-node-title">分析提取</strong>
                  </div>
                  <p className="flow-node-desc">
                    大纲/人物/世界观/风格
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 续写模式：章节创作节点 */}
                <div className={`flow-node${status.chapters.drafted > 0 ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.chapters.drafted > 0 ? " flow-node-badge--done" : ""}`}>3</span>
                    <strong className="flow-node-title">章节创作</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.chapters.drafted > 0 ? `${status.chapters.drafted}/${status.chapters.total} 章` : "自动生成 1-3 章"}
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* 仿写模式：资料节点 */}
                <div className={`flow-node${status.bookAnalysis ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.bookAnalysis ? " flow-node-badge--done" : ""}`}>1</span>
                    <strong className="flow-node-title">资料收集</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.bookAnalysis ? "已完成" : "准备参考文本"}
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 仿写模式：拆书节点 */}
                <div className={`flow-node${status.bookAnalysis?.status === "succeeded" ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.bookAnalysis?.status === "succeeded" ? " flow-node-badge--done" : ""}`}>2</span>
                    <strong className="flow-node-title">拆书分析</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.bookAnalysis ? `${status.bookAnalysis.sectionCompleted}/${status.bookAnalysis.sectionTotal} 分区` : "8 个维度分析"}
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 仿写模式：仿写节点 */}
                <div className={`flow-node${status.imitation ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.imitation ? " flow-node-badge--done" : ""}`}>3</span>
                    <strong className="flow-node-title">仿写方案</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.imitation ? `${status.imitation.sampleDraftCount} 个样章` : "蓝图 + 样章"}
                  </p>
                  <div className="flow-node-connector" />
                </div>

                {/* 仿写模式：创作节点 */}
                <div className={`flow-node${status.chapters.drafted > 0 ? " flow-node--done" : ""}`}>
                  <div className="flow-node-header">
                    <span className={`flow-node-badge${status.chapters.drafted > 0 ? " flow-node-badge--done" : ""}`}>4</span>
                    <strong className="flow-node-title">章节创作</strong>
                  </div>
                  <p className="flow-node-desc">
                    {status.chapters.drafted > 0 ? `${status.chapters.drafted}/${status.chapters.total} 章` : "自动生成 1-3 章"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* 流程进度条 */}
          <div className="dashboard-progress">
            <div className="dashboard-progress-header">
              <span className="dashboard-progress-label">整体进度</span>
              <span className="dashboard-progress-value">
                {(isStandalone || isContinue)
                  ? (status.pipeline ? status.pipeline.progress : 0)
                  : Math.round(
                      (status.bookAnalysis ? 25 : 0) +
                      (status.bookAnalysis?.status === "succeeded" ? 25 : 0) +
                      (status.imitation ? 25 : 0) +
                      (status.chapters.drafted > 0 ? 25 : 0)
                    )
                }%
              </span>
            </div>
            <div className="dashboard-progress-track">
              <div className="dashboard-progress-fill" style={{
                width: `${(isStandalone || isContinue)
                  ? (status.pipeline ? status.pipeline.progress : 0)
                  : Math.round(
                      (status.bookAnalysis ? 25 : 0) +
                      (status.bookAnalysis?.status === "succeeded" ? 25 : 0) +
                      (status.imitation ? 25 : 0) +
                      (status.chapters.drafted > 0 ? 25 : 0)
                    )
                }%`,
              }} />
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <h3 className="dashboard-section-header">成果与使用记录</h3>
        <div className="results-grid">
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {status.chapters.firstThree.map((chapter) => (
              <div key={chapter.order} className="chapter-row">
                <span>第{chapter.order}章 {chapter.title}</span>
                <strong>{chapter.hasContent ? `${chapter.wordCount}字 · ${translateChapterSource(chapter.source || "manual").label}` : "未生成"}</strong>
              </div>
            ))}
          </div>
          <div className="usage-list">
            {status.usage.recent.slice(0, 8).map((item) => (
              <div key={item.id} className="usage-row">
                <span>{item.title}</span>
                <em className="usage-type">{translateAssetType(item.assetType)}</em>
              </div>
            ))}
            {status.usage.recent.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.875rem" }}>还没有流水线使用记录。</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DashboardPanel;

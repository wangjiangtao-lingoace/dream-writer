import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { translateChapterSource } from "../../utils/translate";
import BlueprintViewer from "./BlueprintViewer";
import PipelineConfigModal, { PipelineConfig } from "../PipelineConfigModal";

interface BookAnalysisSection {
  id: string;
  analysisId: string;
  sectionKey: string;
  title: string;
  status: string;
  aiContent?: string | null;
  editedContent?: string | null;
  notes?: string | null;
  evidence: Array<{ label: string; excerpt: string; sourceLabel: string }>;
  frozen: boolean;
  usedForImitation: boolean;
  sortOrder: number;
  updatedAt: string;
}

interface BookAnalysisDetail {
  id: string;
  title: string;
  sourceTitle?: string | null;
  sourceText: string;
  status: string;
  summary?: string | null;
  progress: number;
  currentItemLabel?: string | null;
  lastError?: string | null;
  publishedAssetId?: string | null;
  sections: BookAnalysisSection[];
  createdAt: string;
  updatedAt: string;
}

interface ImitationPlan {
  id: string;
  novelId: string;
  bookAnalysisId: string;
  title: string;
  status: string;
  sectionPlans: Array<{
    sectionKey: string;
    title: string;
    transferableRules: string[];
    localApplication: string;
  }>;
  blueprint: any;
  chapterTemplate: any;
  sampleDrafts: Array<{ chapterTitle: string; draft: string }>;
  knowledgeAssetId?: string | null;
  pipelineJobId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OneClickAnalysisResult {
  analysis: BookAnalysisDetail;
  materializedAnalysis: {
    analysisId: string;
    novelId: string;
    knowledgeAssetId: string;
    memoryCount: number;
    materializedAt: string;
  };
  imitationPlan: ImitationPlan;
  pipelineJob: {
    id: string;
    novelId: string;
    status: string;
    config?: string | null;
  };
}

interface NovelSearchResult {
  title: string;
  matchedTitle?: string;
  status: "found" | "no_source_found";
  sourcePolicy: string;
  sources: Array<{
    sourceUrl: string;
    sourceTitle: string;
    excerpt: string;
    confidence: number;
  }>;
  synopsis: string;
  rawContent: string;
  confidence: number;
  failureReason?: string;
}

const AnalysisPanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const navigate = useNavigate();
  const [bookAnalyses, setBookAnalyses] = useState<BookAnalysisDetail[]>([]);
  const [imitationPlans, setImitationPlans] = useState<ImitationPlan[]>([]);
  const [activeAnalysisId, setActiveAnalysisId] = useState<string | null>(null);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [analysisTitle, setAnalysisTitle] = useState("");
  const [analysisSourceTitle, setAnalysisSourceTitle] = useState("");
  const [analysisSourceText, setAnalysisSourceText] = useState("");
  const [sourceMode, setSourceMode] = useState<"none" | "verified" | "manual">("none");
  const [loading, setLoading] = useState(false);
  const [oneClickRunning, setOneClickRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
  const [sectionDraft, setSectionDraft] = useState("");
  const [sectionNotes, setSectionNotes] = useState("");
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const activeAnalysis = useMemo(
    () => bookAnalyses.find((a) => a.id === activeAnalysisId) ?? bookAnalyses[0] ?? null,
    [bookAnalyses, activeAnalysisId]
  );
  const activePlan = useMemo(
    () => imitationPlans.find((plan) => plan.id === activePlanId) ?? imitationPlans[0] ?? null,
    [imitationPlans, activePlanId]
  );

  useEffect(() => {
    loadBookAnalyses();
    loadImitationPlans();
  }, [novelId]);

  useEffect(() => {
    if (notice && !oneClickRunning) {
      const timer = setTimeout(() => setNotice(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notice, oneClickRunning]);

  async function loadBookAnalyses(selectId?: string) {
    try {
      const list = await api.get<BookAnalysisDetail[]>(`/api/book-analysis?novelId=${encodeURIComponent(novelId)}`);
      setBookAnalyses(list);
      const nextId = selectId && list.some((analysis) => analysis.id === selectId)
        ? selectId
        : list[0]?.id ?? null;
      setActiveAnalysisId(nextId);
    } catch (error) {
      console.error("加载拆书列表失败:", error);
    }
  }

  async function loadImitationPlans(selectId?: string) {
    try {
      const list = await api.get<ImitationPlan[]>(`/api/novels/${novelId}/imitation-plans`);
      setImitationPlans(list);
      const nextId = selectId && list.some((plan) => plan.id === selectId)
        ? selectId
        : list[0]?.id ?? null;
      setActivePlanId(nextId);
    } catch (error) {
      console.error("加载仿写方案失败:", error);
    }
  }

  async function fetchSourceByTitle() {
    const title = analysisTitle.trim();
    if (!title) {
      throw new Error("请先输入拆书标题或书名。");
    }
    setNotice("正在按书名查询真实来源...");
    const result = await api.get<NovelSearchResult>(`/api/search/novel?title=${encodeURIComponent(title)}`);
    if (result.status !== "found" || !result.rawContent?.trim()) {
      throw new Error(`按「${title}」没有查到可用于拆书的真实来源。请确认输入的是书名，例如「权宠天下」或「医妃倾天下」。`);
    }
    const source = result.sources[0];
    setAnalysisSourceTitle(source?.sourceTitle || result.matchedTitle || result.title);
    setAnalysisSourceText(result.rawContent);
    setSourceMode("verified");
    setNotice(`已找到真实来源：${source?.sourceTitle || result.title}`);
    return {
      title: result.matchedTitle || result.title,
      sourceTitle: source?.sourceTitle || result.matchedTitle || result.title,
      sourceText: result.rawContent,
    };
  }

  async function resolveSourceMaterial() {
    const manualText = analysisSourceText.trim();
    if (manualText.length >= 80) {
      setSourceMode(sourceMode === "verified" ? "verified" : "manual");
      return {
        title: analysisTitle,
        sourceTitle: analysisSourceTitle || analysisTitle,
        sourceText: manualText,
      };
    }
    return fetchSourceByTitle();
  }

  async function createBookAnalysis() {
    setLoading(true);
    setNotice(null);
    try {
      const source = await resolveSourceMaterial();
      const analysis = await api.post<BookAnalysisDetail>("/api/book-analysis", {
        title: source.title,
        sourceTitle: source.sourceTitle,
        sourceText: source.sourceText,
        novelId,
      });
      setNotice("拆书已完成，结果已分区保存。");
      await loadBookAnalyses(analysis.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "拆书失败。");
    } finally {
      setLoading(false);
    }
  }

  async function oneClickAnalyzeAndCreate() {
    setLoading(true);
    setOneClickRunning(true);
    setNotice("一键流程已启动：查询资料 → 拆书 → 落库 → 仿写方案 → 样章 → 自动创作。请保持页面打开。");
    try {
      const source = await resolveSourceMaterial();
      const result = await api.post<OneClickAnalysisResult>("/api/book-analysis/one-click", {
        title: source.title,
        sourceTitle: source.sourceTitle,
        sourceText: source.sourceText,
        novelId,
      });
      await Promise.all([
        loadBookAnalyses(result.analysis.id),
        loadImitationPlans(result.imitationPlan.id),
      ]);
      setNotice("一键拆书与创作流程已完成，正在打开自动创作流程。");
      navigate(`/novel/${novelId}/pipeline`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "一键拆书并创作失败。");
    } finally {
      setOneClickRunning(false);
      setLoading(false);
    }
  }

  async function rebuildBookAnalysis() {
    if (!activeAnalysis) return;
    setLoading(true);
    setNotice(null);
    try {
      const analysis = await api.post<BookAnalysisDetail>(
        `/api/book-analysis/${activeAnalysis.id}/rebuild`
      );
      setNotice("拆书已重新生成。");
      await loadBookAnalyses(analysis.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "重建拆书失败。");
    } finally {
      setLoading(false);
    }
  }

  async function publishBookAnalysis() {
    if (!activeAnalysis) return;
    setLoading(true);
    setNotice(null);
    try {
      await api.post(`/api/book-analysis/${activeAnalysis.id}/publish`, {
        novelId: novelId,
      });
      setNotice("拆书结果已发布到当前作品知识库。");
      await loadBookAnalyses(activeAnalysis.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "发布到知识库失败。");
    } finally {
      setLoading(false);
    }
  }

  async function materializeBookAnalysis() {
    if (!activeAnalysis) return;
    setLoading(true);
    setNotice(null);
    try {
      await api.post(`/api/book-analysis/${activeAnalysis.id}/materialize`, { novelId });
      setNotice("拆书分区已沉淀到当前作品知识库和记忆。");
      await loadBookAnalyses(activeAnalysis.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "沉淀拆书失败。");
    } finally {
      setLoading(false);
    }
  }

  async function createImitationPlan() {
    if (!activeAnalysis) return;
    setLoading(true);
    setNotice(null);
    try {
      const plan = await api.post<ImitationPlan>(`/api/book-analysis/${activeAnalysis.id}/imitation-plan`, { novelId });
      setNotice("仿写方案已生成，包含创作蓝图、章节模板和样章草稿。");
      await loadImitationPlans(plan.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "生成仿写方案失败。");
    } finally {
      setLoading(false);
    }
  }

  async function materializeImitationPlan() {
    if (!activePlan) return;
    setLoading(true);
    setNotice(null);
    try {
      const plan = await api.post<ImitationPlan>(`/api/imitation-plans/${activePlan.id}/materialize`);
      setNotice("仿写方案已落入知识库和记忆。");
      await loadImitationPlans(plan.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "沉淀仿写方案失败。");
    } finally {
      setLoading(false);
    }
  }

  async function applyPlanToPipeline() {
    if (!activePlan) return;
    setConfigModalOpen(true);
  }

  async function handleConfigConfirm(config: PipelineConfig) {
    if (!activePlan) return;
    setConfigModalOpen(false);
    setLoading(true);
    setNotice(null);
    try {
      await api.post(`/api/imitation-plans/${activePlan.id}/apply-to-pipeline`, {
        autoContinue: config.autoContinue,
        autoDraftChapters: config.autoDraftChapters,
        volumeCount: config.volumeCount,
        chaptersPerVolume: config.chaptersPerVolume,
        targetWordCount: config.targetWordCount,
        overwriteExistingChapters: config.overwriteExistingChapters,
      });
      setNotice("已将仿写方案交给自动创作流程，将自动生成前 1-3 章草稿。");
      navigate(`/novel/${novelId}/pipeline`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "启动自动创作失败。");
    } finally {
      setLoading(false);
    }
  }

  function beginEditSection(section: BookAnalysisSection) {
    setEditingSectionKey(section.sectionKey);
    setSectionDraft(section.editedContent || section.aiContent || "");
    setSectionNotes(section.notes || "");
  }

  async function saveSection(section: BookAnalysisSection) {
    if (!activeAnalysis) return;
    setLoading(true);
    setNotice(null);
    try {
      const analysis = await api<BookAnalysisDetail>(`/api/book-analysis/${activeAnalysis.id}/sections/${section.sectionKey}`, {
        method: "PATCH",
        body: JSON.stringify({ editedContent: sectionDraft, notes: sectionNotes }),
      });
      setBookAnalyses((items) => items.map((item) => item.id === analysis.id ? analysis : item));
      setActiveAnalysisId(analysis.id);
      setEditingSectionKey(null);
      setNotice("分区修改已保存。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存分区失败。");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSectionUsage(section: BookAnalysisSection) {
    if (!activeAnalysis) return;
    setLoading(true);
    setNotice(null);
    try {
      const analysis = await api<BookAnalysisDetail>(`/api/book-analysis/${activeAnalysis.id}/sections/${section.sectionKey}`, {
        method: "PATCH",
        body: JSON.stringify({ usedForImitation: !section.usedForImitation }),
      });
      setBookAnalyses((items) => items.map((item) => item.id === analysis.id ? analysis : item));
      setActiveAnalysisId(analysis.id);
      setNotice(!section.usedForImitation ? "该分区已加入仿写输入。" : "该分区已从仿写输入中排除。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "切换仿写开关失败。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="analysis-panel">
      <div className="panel-header">
        <h2>当前作品拆书与仿写</h2>
        <p className="panel-desc">拆书结果会绑定当前作品；可修改 8 个分区，再生成仿写蓝图、章节模板和样章草稿。</p>
      </div>

      {notice && (
        <div className="notice-bar" style={{
          padding: "0.75rem 1rem",
          background: notice.includes("失败") ? "var(--error-muted)" : "var(--accent-muted)",
          color: notice.includes("失败") ? "var(--error)" : "var(--accent)",
          borderRadius: "var(--radius-sm)",
          marginBottom: "1rem",
          fontSize: "0.875rem",
        }}>
          {notice}
        </div>
      )}

      <div className="analysis-layout" style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: "1.5rem",
        minHeight: "calc(100vh - 200px)",
      }}>
        <div className="analysis-form" style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>拆书标题</span>
            <input
              value={analysisTitle}
              onChange={(e) => setAnalysisTitle(e.target.value)}
              placeholder="输入书名，例如：权宠天下 / 医妃倾天下"
              style={{
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
              }}
            />
          </label>
          <button
            onClick={() => fetchSourceByTitle().catch((error) => setNotice(error instanceof Error ? error.message : "查询资料失败。"))}
            disabled={!analysisTitle.trim() || loading}
            style={{
              padding: "0.625rem 1rem",
              background: !analysisTitle.trim() || loading ? "var(--border-default)" : "var(--bg-surface)",
              color: !analysisTitle.trim() || loading ? "var(--text-muted)" : "var(--accent)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: !analysisTitle.trim() || loading ? "not-allowed" : "pointer",
            }}
          >
            按书名自动查询资料
          </button>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>来源标题</span>
            <input
              value={analysisSourceTitle}
              onChange={(e) => setAnalysisSourceTitle(e.target.value)}
              style={{
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
              }}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.375rem", flex: 1 }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              原文 / 参考片段
              {sourceMode !== "none" && (
                <em style={{ marginLeft: "0.5rem", fontStyle: "normal", color: "var(--accent)" }}>
                  {sourceMode === "verified" ? "真实来源" : "用户粘贴"}
                </em>
              )}
            </span>
            <textarea
              value={analysisSourceText}
              onChange={(e) => {
                setAnalysisSourceText(e.target.value);
                setSourceMode(e.target.value.trim() ? "manual" : "none");
              }}
              placeholder="可留空。点击“一键拆书并创作”时，系统会先按书名自动查询真实来源；查不到时才需要你粘贴资料。"
              style={{
                padding: "0.5rem 0.75rem",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                background: "var(--bg-base)",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                flex: 1,
                minHeight: "200px",
                resize: "vertical",
              }}
            />
          </label>
          <button
            className="btn-primary"
            onClick={oneClickAnalyzeAndCreate}
            disabled={!analysisTitle.trim() || loading}
            style={{
              padding: "0.75rem 1rem",
              background: !analysisTitle.trim() || loading ? "var(--border-default)" : "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.9375rem",
              fontWeight: 700,
              cursor: !analysisTitle.trim() || loading ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
              boxShadow: !analysisTitle.trim() || loading ? "none" : "var(--shadow-sm)",
            }}
          >
            {oneClickRunning ? "一键流程处理中..." : "一键拆书并创作"}
          </button>
          <p style={{ margin: "-0.5rem 0 0", fontSize: "0.75rem", lineHeight: 1.6, color: "var(--text-muted)" }}>
            主流程会先按书名查询真实来源；查到后自动完成拆书 8 分区、知识库沉淀、仿写方案、样章草稿，并启动自动创作。
          </p>

          <button
            className="btn-primary"
            onClick={createBookAnalysis}
            disabled={!analysisTitle.trim() || loading}
            style={{
              padding: "0.625rem 1rem",
              background: !analysisTitle.trim() || loading ? "var(--border-default)" : "transparent",
              color: !analysisTitle.trim() || loading ? "var(--text-muted)" : "var(--accent)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: !analysisTitle.trim() || loading ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
            }}
          >
            {loading ? "处理中" : "只创建拆书"}
          </button>

          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: "0.5rem",
            padding: "0.75rem",
            background: "var(--accent-muted)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
          }}>
            {["1 查看/修改 8 个分区", "2 沉淀知识库与记忆", "3 生成仿写方案", "4 基于方案自动创作"].map((step) => (
              <span key={step} style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{step}</span>
            ))}
          </div>

          <div className="analysis-list" style={{
            borderTop: "1px solid var(--border-default)",
            paddingTop: "1rem",
          }}>
            <h3 style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontWeight: 600 }}>
              拆书记录
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
              {bookAnalyses.map((analysis) => (
                <button
                  key={analysis.id}
                  onClick={() => {
                    setActiveAnalysisId(analysis.id);
                    setNotice(`已打开拆书：${analysis.title}`);
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                    padding: "0.625rem 0.75rem",
                    background: activeAnalysis?.id === analysis.id ? "var(--accent-muted)" : "transparent",
                    border: activeAnalysis?.id === analysis.id ? "1px solid var(--border-default)" : "1px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all var(--transition-fast)",
                  }}
                >
                  <strong style={{ fontSize: "0.875rem", color: "var(--text-primary)" }}>{analysis.title}</strong>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                    {analysis.status} · {analysis.progress}%
                  </span>
                </button>
              ))}
              {bookAnalyses.length === 0 && (
                <p style={{ fontSize: "0.8125rem", color: "var(--text-muted)", padding: "1rem", textAlign: "center" }}>
                  还没有拆书结果。先粘贴一段参考文本。
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="analysis-result" style={{
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-base)",
          overflow: "hidden",
        }}>
          {activeAnalysis ? (
            <>
              <div className="analysis-summary" style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "1rem 1.25rem",
                borderBottom: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
              }}>
                <div>
                  <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>{activeAnalysis.title}</strong>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)", marginLeft: "0.75rem" }}>
                    {activeAnalysis.sourceTitle || "未填写来源"} · {activeAnalysis.status} · {activeAnalysis.progress}%
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button
                    onClick={rebuildBookAnalysis}
                    disabled={loading}
                    style={{
                      padding: "0.375rem 0.75rem",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8125rem",
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    重建拆书
                  </button>
                  <button
                    onClick={materializeBookAnalysis}
                    disabled={activeAnalysis.status !== "succeeded" || loading}
                    style={{
                      padding: "0.375rem 0.75rem",
                      background: activeAnalysis.status !== "succeeded" || loading ? "var(--border-default)" : "var(--accent)",
                      color: "var(--text-inverse)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8125rem",
                      cursor: activeAnalysis.status !== "succeeded" || loading ? "not-allowed" : "pointer",
                    }}
                  >
                    沉淀拆书
                  </button>
                  <button
                    onClick={createImitationPlan}
                    disabled={activeAnalysis.status !== "succeeded" || loading}
                    style={{
                      padding: "0.375rem 0.75rem",
                      background: activeAnalysis.status !== "succeeded" || loading ? "var(--border-default)" : "var(--accent)",
                      color: "var(--text-inverse)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8125rem",
                      cursor: activeAnalysis.status !== "succeeded" || loading ? "not-allowed" : "pointer",
                    }}
                  >
                    生成仿写方案
                  </button>
                </div>
              </div>
              {activeAnalysis.publishedAssetId && (
                <div style={{
                  padding: "0.5rem 1.25rem",
                  background: "var(--accent-muted)",
                  borderBottom: "1px solid var(--border-default)",
                  fontSize: "0.8125rem",
                  color: "var(--accent)",
                }}>
                  ✓ 已发布
                </div>
              )}
              <div className="analysis-sections" style={{
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "1rem",
                maxHeight: "calc(100vh - 350px)",
                overflowY: "auto",
              }}>
                {/* 分区标签页导航 */}
                <div style={{
                  display: "flex",
                  gap: "0.5rem",
                  padding: "0.5rem",
                  background: "var(--bg-surface)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-default)",
                  overflowX: "auto",
                }}>
                  {activeAnalysis.sections.map((section, index) => (
                    <button
                      key={section.id}
                      onClick={() => setActiveSectionIndex(index)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        padding: "0.5rem 0.75rem",
                        background: activeSectionIndex === index ? "var(--accent-muted)" : "transparent",
                        color: activeSectionIndex === index ? "var(--accent)" : "var(--text-secondary)",
                        border: activeSectionIndex === index ? "1px solid var(--accent)" : "1px solid transparent",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        whiteSpace: "nowrap",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <span style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "1.25rem",
                        height: "1.25rem",
                        background: activeSectionIndex === index ? "var(--accent)" : "var(--text-muted)",
                        color: "var(--text-inverse)",
                        borderRadius: "50%",
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                      }}>
                        {section.sortOrder}
                      </span>
                      {section.title}
                      <em style={{
                        fontStyle: "normal",
                        fontSize: "0.6875rem",
                        color: section.status === "succeeded" ? "#28a745" : "var(--text-muted)",
                      }}>
                        {section.status === "succeeded" ? "✓" : section.status}
                      </em>
                    </button>
                  ))}
                </div>

                {/* 当前选中分区的详细内容 */}
                {activeAnalysis.sections[activeSectionIndex] && (() => {
                  const section = activeAnalysis.sections[activeSectionIndex];
                  return (
                    <article key={section.id} style={{
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-sm)",
                      overflow: "hidden",
                    }}>
                      <header style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.75rem 1rem",
                        background: "var(--bg-surface)",
                        borderBottom: "1px solid var(--border-default)",
                      }}>
                        <span style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "1.5rem",
                          height: "1.5rem",
                          background: "var(--accent)",
                          color: "var(--text-inverse)",
                          borderRadius: "50%",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                        }}>
                          {section.sortOrder}
                        </span>
                        <strong style={{ fontSize: "0.9375rem", color: "var(--text-primary)", flex: 1 }}>
                          {section.title}
                        </strong>
                        <label style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          fontSize: "0.75rem",
                          color: "var(--text-secondary)",
                        }}>
                          <input
                            type="checkbox"
                            checked={section.usedForImitation !== false}
                            onChange={() => toggleSectionUsage(section)}
                            disabled={loading}
                          />
                          用于仿写
                        </label>
                        <button
                          onClick={() => beginEditSection(section)}
                          disabled={loading}
                          style={{
                            padding: "0.25rem 0.5rem",
                            background: "transparent",
                            color: "var(--accent)",
                            border: "1px solid var(--border-default)",
                            borderRadius: "var(--radius-sm)",
                            fontSize: "0.75rem",
                            cursor: loading ? "not-allowed" : "pointer",
                          }}
                        >
                          修改
                        </button>
                        <em style={{
                          fontSize: "0.75rem",
                          color: section.status === "succeeded" ? "#28a745" : "var(--text-muted)",
                          fontStyle: "normal",
                        }}>
                          {section.status}
                        </em>
                      </header>
                      <pre style={{
                        margin: 0,
                        padding: "1rem",
                        fontFamily: "inherit",
                        fontSize: "0.875rem",
                        lineHeight: 1.7,
                        color: "var(--text-primary)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        background: "var(--bg-base)",
                        minHeight: "200px",
                      }}>
                        {section.editedContent || section.aiContent || "暂无内容。"}
                      </pre>
                      {editingSectionKey === section.sectionKey && (
                        <div style={{ padding: "1rem", borderTop: "1px solid var(--border-default)", display: "grid", gap: "0.75rem" }}>
                          <label style={{ display: "grid", gap: "0.375rem" }}>
                            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>分区修改内容</span>
                            <textarea
                              value={sectionDraft}
                              onChange={(event) => setSectionDraft(event.target.value)}
                              style={{
                                minHeight: "180px",
                                padding: "0.75rem",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-sm)",
                                background: "var(--bg-base)",
                                color: "var(--text-primary)",
                                lineHeight: 1.7,
                              }}
                            />
                          </label>
                          <label style={{ display: "grid", gap: "0.375rem" }}>
                            <span style={{ fontSize: "0.8125rem", color: "var(--text-muted)" }}>修改备注</span>
                            <input
                              value={sectionNotes}
                              onChange={(event) => setSectionNotes(event.target.value)}
                              style={{
                                padding: "0.5rem 0.75rem",
                                border: "1px solid var(--border-default)",
                                borderRadius: "var(--radius-sm)",
                                background: "var(--bg-base)",
                                color: "var(--text-primary)",
                              }}
                            />
                          </label>
                          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                            <button onClick={() => setEditingSectionKey(null)} style={{
                              padding: "0.5rem 0.75rem",
                              background: "transparent",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border-default)",
                              borderRadius: "var(--radius-sm)",
                            }}>
                              取消
                            </button>
                            <button onClick={() => saveSection(section)} disabled={loading} style={{
                              padding: "0.5rem 0.75rem",
                              background: "var(--accent)",
                              color: "var(--text-inverse)",
                              border: "none",
                              borderRadius: "var(--radius-sm)",
                            }}>
                              保存分区
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })()}
              </div>
            </>
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "400px",
              color: "var(--text-muted)",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "3rem", height: "3rem", marginBottom: "1rem", opacity: 0.5 }}>
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
              <p style={{ fontSize: "0.9375rem" }}>创建或选择一个拆书任务后，这里会展示分区结果。</p>
            </div>
          )}
        </div>

        <div className="imitation-plan-result" style={{
          gridColumn: "1 / -1",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-base)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border-default)",
            background: "var(--bg-surface)",
          }}>
            <div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>仿写方案</strong>
              <span style={{ display: "block", marginTop: "0.25rem", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                按 8 个拆书分区生成原创创作蓝图、章节模板和样章草稿。
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button
                onClick={materializeImitationPlan}
                disabled={!activePlan || loading}
                style={{
                  padding: "0.375rem 0.75rem",
                  background: !activePlan || loading ? "var(--border-default)" : "transparent",
                  color: !activePlan || loading ? "var(--text-muted)" : "var(--text-secondary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8125rem",
                  cursor: !activePlan || loading ? "not-allowed" : "pointer",
                }}
              >
                沉淀方案
              </button>
              <button
                onClick={applyPlanToPipeline}
                disabled={!activePlan || loading}
                style={{
                  padding: "0.375rem 0.75rem",
                  background: !activePlan || loading ? "var(--border-default)" : "var(--accent)",
                  color: "var(--text-inverse)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8125rem",
                  cursor: !activePlan || loading ? "not-allowed" : "pointer",
                }}
              >
                自动仿写 1-3 章
              </button>
            </div>
          </div>

          {imitationPlans.length > 0 && (
            <div style={{ display: "flex", gap: "0.5rem", padding: "0.75rem 1.25rem", borderBottom: "1px solid var(--border-default)", overflowX: "auto" }}>
              {imitationPlans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setActivePlanId(plan.id)}
                  style={{
                    flex: "0 0 auto",
                    padding: "0.5rem 0.75rem",
                    background: activePlan?.id === plan.id ? "var(--accent-muted)" : "transparent",
                    color: "var(--text-primary)",
                    border: activePlan?.id === plan.id ? "1px solid var(--border-default)" : "1px solid transparent",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  {plan.title}
                </button>
              ))}
            </div>
          )}

          {activePlan ? (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "1rem", padding: "1.25rem" }}>
              <section style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <h3 style={{ margin: 0, padding: "0.75rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "0.9375rem" }}>8 分区仿写落点</h3>
                <div style={{ display: "grid", gap: "0.75rem", padding: "1rem", maxHeight: "420px", overflowY: "auto" }}>
                  {activePlan.sectionPlans.map((section) => (
                    <article key={section.sectionKey} style={{ borderBottom: "1px solid var(--border-default)", paddingBottom: "0.75rem" }}>
                      <strong style={{ display: "block", marginBottom: "0.375rem", color: "var(--text-primary)" }}>{section.title}</strong>
                      <p style={{ margin: "0 0 0.5rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>{section.localApplication}</p>
                      <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--text-muted)", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                        {(section.transferableRules || []).map((rule) => <li key={rule}>{rule}</li>)}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
              <section style={{ display: "grid", gap: "1rem" }}>
                <article style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                  <h3 style={{ margin: 0, padding: "0.75rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "0.9375rem" }}>创作蓝图</h3>
                  <div style={{ padding: "1rem", maxHeight: "400px", overflowY: "auto" }}>
                    <BlueprintViewer blueprint={activePlan.blueprint} />
                  </div>
                </article>
                <article style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                  <h3 style={{ margin: 0, padding: "0.75rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "0.9375rem" }}>样章草稿</h3>
                  <div style={{ padding: "1rem", maxHeight: "220px", overflow: "auto" }}>
                    {activePlan.sampleDrafts.map((sample) => (
                      <article key={sample.chapterTitle} style={{ marginBottom: "1rem" }}>
                        <strong>{sample.chapterTitle}</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.8125rem", lineHeight: 1.7, color: "var(--text-primary)" }}>{sample.draft}</pre>
                      </article>
                    ))}
                  </div>
                </article>
              </section>
            </div>
          ) : (
            <p style={{ margin: 0, padding: "1.25rem", color: "var(--text-muted)", fontSize: "0.875rem" }}>
              还没有仿写方案。先完成拆书，再点击“生成仿写方案”。
            </p>
          )}
        </div>
      </div>

      <PipelineConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onConfirm={handleConfigConfirm}
        mode="imitation"
      />
    </div>
  );
};

export default AnalysisPanel;

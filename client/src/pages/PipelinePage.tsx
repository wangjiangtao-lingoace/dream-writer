import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/api";
import { usePipelineSSE } from "../hooks/usePipelineSSE";
import SmartJsonViewer from "../components/SmartJsonViewer";
import { translatePipelinePhaseLabel, translatePipelineStepLabel, translateAssetType } from "../utils/translate";
import "../styles/pages/pipeline.css";

interface PipelineStage {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress: number;
  steps: PipelineStep[];
}

interface PipelineStep {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "paused";
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

interface PipelineData {
  id: string;
  novelId: string;
  currentStage: string;
  progress: number;
  stages: PipelineStage[];
  status: "running" | "paused" | "completed" | "failed";
  config?: string;
  lastError?: string | null;
  results: Array<{
    phase: string;
    step: string;
    status: string;
    selfScore?: number | null;
    selfComment?: string | null;
    output?: string | null;
    metadata?: string | null;
  }>;
}

interface PipelineJobResponse {
  id: string;
  novelId: string;
  status: "running" | "paused" | "completed" | "error" | "pending";
  currentPhase: string;
  currentStep: string;
  progress: number;
  config: string;
  lastError?: string | null;
  phaseResults?: Array<{
    id: string;
    phase: string;
    step: string;
    status: string;
    selfScore?: number | null;
    selfComment?: string | null;
    output?: string | null;
    metadata?: string | null;
  }>;
}

const PipelinePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [usage, setUsage] = useState<Array<{ id: string; assetType: string; title: string; usageStage: string }>>([]);
  const [loading, setLoading] = useState(true);

  // 步骤交互状态
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [regenerateKey, setRegenerateKey] = useState<string | null>(null);
  const [regenerateHint, setRegenerateHint] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [confirmFeedback, setConfirmFeedback] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pipelineActionLoading, setPipelineActionLoading] = useState<"pause" | "resume" | null>(null);
  const [expandedRefs, setExpandedRefs] = useState<Set<string>>(new Set());

  // 卷纲菜单状态
  const [selectedVolume, setSelectedVolume] = useState<number | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<Set<number>>(new Set());
  // 编辑模式：false=SmartJsonViewer可读视图，true=JSON高级编辑
  const [jsonEditMode, setJsonEditMode] = useState(false);

  // SSE 相关状态
  const [jobId, setJobId] = useState<string | null>(null);
  const [useFallbackPolling, setUseFallbackPolling] = useState(false);

  useEffect(() => {
    if (id) {
      loadPipeline(id);
    }
  }, [id]);

  // SSE 实时推送
  const debouncedUpdate = useMemo(() => {
    let timer: ReturnType<typeof setTimeout>;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (id) loadPipeline(id, true);
      }, 200);
    };
  }, [id]);

  const handleSSEFallback = useCallback(() => {
    setUseFallbackPolling(true);
  }, []);

  const { isConnected, reconnect } = usePipelineSSE({
    jobId,
    status: pipeline?.status,
    onUpdate: debouncedUpdate,
    onFallback: handleSSEFallback,
  });

  // 回退轮询（仅在 SSE 失败时启用）
  useEffect(() => {
    if (!id || !useFallbackPolling) return;
    if (pipeline?.status === "completed" || pipeline?.status === "failed") return;
    const timer = window.setInterval(() => {
      loadPipeline(id, true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, pipeline?.status, useFallbackPolling]);

  const loadPipeline = async (novelId: string, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<PipelineJobResponse | null>(`/api/pipeline/novel/${novelId}`);
      if (data) {
        setPipeline(mapPipelineJob(data));
        setJobId(data.id);
      } else {
        setPipeline(null);
      }
      const workflow = await api.get<{ usage: { recent: Array<{ id: string; assetType: string; title: string; usageStage: string }> } }>(`/api/novels/${novelId}/workflow-status`);
      setUsage(workflow.usage?.recent || []);
    } catch (error) {
      console.error("加载流程数据失败:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const handlePause = async () => {
    if (!pipeline) return;
    setPipelineActionLoading("pause");
    try {
      await api.post(`/api/pipeline/${pipeline.id}/pause`);
      toast.success("流程已暂停");
      loadPipeline(id!);
    } catch (error) {
      console.error("暂停失败:", error);
      toast.error("暂停失败，请重试");
    } finally {
      setPipelineActionLoading(null);
    }
  };

  const handleResume = async () => {
    if (!pipeline) return;
    setPipelineActionLoading("resume");
    try {
      await api.post(`/api/pipeline/${pipeline.id}/resume`);
      toast.success("流程已恢复");
      setUseFallbackPolling(false);
      await loadPipeline(id!);
      reconnect();
    } catch (error) {
      console.error("恢复失败:", error);
      toast.error("恢复失败，请重试");
    } finally {
      setPipelineActionLoading(null);
    }
  };

  const handleConfirm = async (phase: string, step: string) => {
    if (!pipeline) return;
    const key = `${phase}/${step}`;
    setActionLoading(key);
    try {
      await api.post(`/api/pipeline/${pipeline.id}/confirm`, { phase, step, feedback: confirmFeedback || undefined });
      toast.success("已确认通过");
      setConfirmKey(null);
      setConfirmFeedback("");
      await loadPipeline(id!);
    } catch (error) {
      console.error("确认失败:", error);
      toast.error("确认失败，请重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegenerate = async (phase: string, step: string) => {
    if (!pipeline) return;
    const key = `${phase}/${step}`;
    setActionLoading(key);
    try {
      await api.post(`/api/pipeline/${pipeline.id}/regenerate`, { phase, step, userHint: regenerateHint || undefined });
      toast.success("重新生成已提交");
      setRegenerateKey(null);
      setRegenerateHint("");
      await loadPipeline(id!);
    } catch (error) {
      console.error("重新生成失败:", error);
      toast.error("重新生成失败，请重试");
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveUserContent = async (phase: string, step: string) => {
    if (!pipeline) return;
    const key = `${phase}/${step}`;
    setActionLoading(key);
    try {
      let content: any;
      try { content = JSON.parse(editContent); } catch { content = editContent; }
      await api.post(`/api/pipeline/${pipeline.id}/user-content`, { phase, step, content });
      toast.success("内容已保存");
      setEditingKey(null);
      setEditContent("");
      await loadPipeline(id!);
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败，请重试");
    } finally {
      setActionLoading(null);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedResults((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleRefExpand = (key: string) => {
    setExpandedRefs((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const parseMetadata = (metadata?: string | null): Array<{ assetType: string; title: string }> => {
    if (!metadata) return [];
    try {
      const parsed = JSON.parse(metadata);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const getAssetTypeLabel = (assetType: string): string => {
    const labelMap: Record<string, string> = {
      character: "角色",
      worldview: "世界观",
      memory: "记忆",
      novel_outline: "大纲",
      novel_core: "核心设定",
      volume: "卷纲",
      chapter_outline: "章纲",
      mainline: "主线",
      hook: "钩子",
      knowledge_asset: "知识库",
      book_analysis: "拆书",
      imitation_plan: "仿写方案",
    };
    return labelMap[assetType] || assetType;
  };

  const translatePipelineError = (error: string | null): string => {
    if (!error) return "未知错误";
    if (error.includes("服务器重启")) return "服务器重启导致流程中断，点击「恢复」可继续";
    if (error.includes("该作品已有流程在运行中")) return "该作品已有流程在运行中，请等待完成或暂停后再操作";
    if (error.includes("所有章节生成失败")) return "所有章节生成失败，请检查 LLM 配置后重试";
    if (error.includes("Cannot read properties")) return "数据处理异常，请尝试重新生成当前步骤";
    if (error.includes("timeout") || error.includes("ETIMEDOUT")) return "请求超时，请检查网络连接后重试";
    if (error.includes("429") || error.includes("rate limit")) return "API 调用频率超限，请稍后重试";
    if (error.includes("insufficient_quota")) return "API 额度不足，请检查账户余额";
    if (error.includes("invalid_api_key")) return "API Key 无效，请在设置中重新配置";
    return error.length > 100 ? error.slice(0, 100) + "..." : error;
  };

  const mapPipelineJob = (job: PipelineJobResponse): PipelineData => {
    // 动态步骤名解析（支持 chapter_outline_vol_N）
    const getStepName = (stepId: string) => {
      return translatePipelineStepLabel(stepId);
    };

    // 动态阶段列表：从结果和当前阶段中提取实际出现的 phase
    let config: any = {};
    try { config = JSON.parse(job.config); } catch {}
    const pipelineVersion = config.pipelineVersion || 1;
    const defaultPhases = pipelineVersion >= 2
      ? ["outline", "assets", "planning", "consistency_check", "writing"]
      : ["outline", "assets", "volumes", "chapter_outline", "writing"];
    const results = job.phaseResults ?? [];
    const seenPhases = new Set(results.map((r) => r.phase));
    seenPhases.add(job.currentPhase);
    // 保持默认顺序，只保留实际出现的阶段
    const phases = defaultPhases.filter((p) => seenPhases.has(p));
    // 补充未在默认列表中但出现在结果中的阶段
    for (const p of seenPhases) {
      if (!phases.includes(p)) phases.push(p);
    }
    const stages = phases.map((phase) => {
      const phaseResults = results.filter((result) => result.phase === phase);
      const isCurrent = job.currentPhase === phase;
      const status: PipelineStage["status"] = job.status === "error" && isCurrent
        ? "failed"
        : phaseResults.length > 0 && phaseResults.every((result) => result.status === "confirmed" || result.status === "completed")
          ? "completed"
          : isCurrent && job.status === "running"
            ? "in_progress"
            : "pending";
      const steps = phaseResults.length > 0
        ? phaseResults.map((result) => ({
            id: result.step,
            name: getStepName(result.step),
            status: (result.status === "completed" || result.status === "confirmed" ? "completed" : "pending") as PipelineStep["status"],
            message: result.selfComment || undefined,
          }))
        : [{
            id: isCurrent ? job.currentStep : phase,
            name: getStepName(isCurrent ? job.currentStep : phase),
            status: (isCurrent && job.status === "running" ? "in_progress" : "pending") as PipelineStep["status"],
            message: isCurrent ? "正在处理当前步骤" : undefined,
          }];
      return {
        id: phase,
        name: translatePipelinePhaseLabel(phase),
        status,
        progress: isCurrent ? job.progress : status === "completed" ? 100 : 0,
        steps,
      };
    });
    return {
      id: job.id,
      novelId: job.novelId,
      currentStage: job.currentPhase,
      progress: job.progress,
      status: job.status === "error" ? "failed" : job.status === "pending" ? "paused" : job.status,
      stages,
      config: job.config,
      lastError: job.lastError,
      results: results.map(r => ({
        ...r,
        metadata: r.metadata,
      })),
    };
  };

  const parseOutput = (value?: string | null) => {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  };

  const summarizeResult = (step: string, output: any) => {
    if (!output) return "暂无内容。";
    if (step === "analyze") {
      const items = [];
      if (output.hasOutline) items.push("大纲 ✓");
      else items.push("大纲 ✗");
      if (output.hasCharacters) items.push("人物 ✓");
      else items.push("人物 ✗");
      if (output.hasWorldview) items.push("世界观 ✓");
      else items.push("世界观 ✗");
      if (output.hasStyle) items.push("风格 ✓");
      else items.push("风格 ✗");
      if (output.hasVolumes) items.push("卷结构 ✓");
      else items.push("卷结构 ✗");
      return `检测到：${items.join("、")}\n${output.summary || ""}`;
    }
    if (step === "decompose") {
      const lines = [];
      if (output.decomposed?.length) lines.push(`已拆解：${output.decomposed.join("、")}`);
      if (output.skipped?.length) lines.push(`待生成：${output.skipped.join("、")}`);
      return lines.join("\n") || "拆解完成。";
    }
    if (step === "chapter_drafts" && Array.isArray(output.chapters)) {
      return output.chapters.map((chapter: any) => {
        const skipped = chapter.skipped ? "已跳过已有正文" : `${chapter.wordCount || 0} 字`;
        return `第${chapter.order}章 ${chapter.title}：${skipped}`;
      }).join("\n");
    }
    if (step === "outline") {
      return [output.title, output.genre, output.hook, output.mainConflict].filter(Boolean).join("\n");
    }
    if (step === "worldview") {
      return [output.name, output.summary, output.rules].filter(Boolean).join("\n");
    }
    if (step === "characters" && Array.isArray(output.characters)) {
      return output.characters.map((item: any) => `${item.name}：${item.role || ""} ${item.motivation || ""}`).join("\n");
    }
    if (step === "volume" && Array.isArray(output.volumes)) {
      return output.volumes.map((item: any) => `${item.title}：${item.goal || ""}`).join("\n");
    }
    if (step === "volume_outline" && Array.isArray(output.volumes)) {
      return output.volumes.map((item: any, i: number) => `第${i + 1}卷 ${item.title}：${item.goal || ""}`).join("\n");
    }
    if (step === "chapter_outline" && Array.isArray(output.chapterOutlines)) {
      return output.chapterOutlines.flatMap((volume: any) => volume.chapters || []).slice(0, 6).map((item: any, index: number) => `第${index + 1}章 ${item.title}：${item.goal || item.conflict || ""}`).join("\n");
    }
    if (step.match(/^chapter_outline_vol_/) && Array.isArray(output.chapters)) {
      return output.chapters.slice(0, 8).map((ch: any, i: number) => {
        const chars = (ch.characters || []).map((c: any) => c.name).join("、");
        return `第${i + 1}章 ${ch.title}：${ch.goal || ""}${chars ? ` [${chars}]` : ""}`;
      }).join("\n");
    }
    if (step === "story_arcs") {
      const lines: string[] = [];
      if (Array.isArray(output.mainlines) && output.mainlines.length) {
        lines.push(`${output.mainlines.length} 条主线`);
        for (const m of output.mainlines.slice(0, 3)) {
          lines.push(`  ${m.title}（${m.type || "main"}）：${m.description?.slice(0, 60) || ""}`);
        }
      }
      if (Array.isArray(output.crossVolumeHooks) && output.crossVolumeHooks.length) {
        lines.push(`${output.crossVolumeHooks.length} 个跨卷钩子`);
      }
      if (output.emotionCurveSummary) {
        lines.push(`情绪节奏：${output.emotionCurveSummary.rhythmPattern || "已规划"}`);
      }
      return lines.join("\n") || "弧线规划完成";
    }
    if (step === "consistency") {
      const score = output.overallScore || 0;
      const passed = output.passed ? "通过" : "有问题";
      const issueCount = output.issues?.length || 0;
      const lines = [`评分: ${score}/10 | ${passed} | ${issueCount} 个问题`];
      if (output.summary) lines.push(output.summary);
      if (output.hookStatus) {
        lines.push(`钩子：${output.hookStatus.total || 0} 个，已回收 ${output.hookStatus.resolved || 0} 个`);
      }
      if (Array.isArray(output.issues) && output.issues.length > 0) {
        for (const issue of output.issues.slice(0, 3)) {
          lines.push(`[${issue.severity || "medium"}] ${issue.description || ""}`);
        }
      }
      return lines.join("\n");
    }
    if (typeof output === "string") return output.slice(0, 600);
    return JSON.stringify(output, null, 2).slice(0, 900);
  };

  const getStageIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        );
      case "in_progress":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="spinning">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        );
      case "failed":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  };

  const getStepStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case "in_progress":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="spinning">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        );
      case "failed":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        );
      case "paused":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
          </svg>
        );
    }
  };

  const getOverallProgress = () => {
    if (!pipeline) return 0;
    if (pipeline.status === "completed") return 100;
    return Math.max(0, Math.min(100, pipeline.progress));
  };

  const btnSmallStyle: React.CSSProperties = {
    padding: "0.375rem 0.75rem", background: "transparent", color: "var(--text-secondary)",
    border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)",
    fontSize: "0.75rem", cursor: "pointer", whiteSpace: "nowrap",
  };

  const btnPrimaryStyle: React.CSSProperties = {
    ...btnSmallStyle,
    background: "var(--accent)",
    color: "var(--text-inverse)",
    borderColor: "var(--accent)",
  };

  const btnDangerStyle: React.CSSProperties = {
    ...btnSmallStyle,
    color: "var(--error)",
    borderColor: "var(--error-border)",
  };

  // 解析卷纲数据
  const getVolumeOutlineData = () => {
    if (!pipeline) return null;
    const volResult = pipeline.results.find(r => r.step === "volume_outline");
    if (!volResult?.output) return null;
    try {
      return JSON.parse(volResult.output);
    } catch { return null; }
  };

  // 解析指定卷的章纲数据
  const getChapterOutlineData = (volIndex: number) => {
    if (!pipeline) return null;
    const chapResult = pipeline.results.find(r => r.step === `chapter_outline_vol_${volIndex + 1}`);
    if (!chapResult?.output) return null;
    try {
      return JSON.parse(chapResult.output);
    } catch { return null; }
  };

  // 获取章纲确认状态
  const getChapterOutlineStatus = (volIndex: number) => {
    if (!pipeline) return null;
    const chapResult = pipeline.results.find(r => r.step === `chapter_outline_vol_${volIndex + 1}`);
    return chapResult?.status || null;
  };

  // 获取卷纲确认状态
  const getVolumeOutlineStatus = () => {
    if (!pipeline) return null;
    const volResult = pipeline.results.find(r => r.step === "volume_outline");
    return volResult?.status || null;
  };

  const toggleChapterExpand = (chapterIndex: number) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      next.has(chapterIndex) ? next.delete(chapterIndex) : next.add(chapterIndex);
      return next;
    });
  };

  const renderPlanningSection = () => {
    const volumeData = getVolumeOutlineData();
    const volStatus = getVolumeOutlineStatus();
    const isVolConfirmed = volStatus === "confirmed";

    if (!volumeData || !Array.isArray(volumeData.volumes)) {
      return (
        <div style={{ padding: "var(--space-4)", color: "var(--text-muted)", textAlign: "center" }}>
          卷纲尚未生成，请先完成卷纲规划。
        </div>
      );
    }

    const volumes = volumeData.volumes;

    // 卷详情视图
    if (selectedVolume !== null) {
      const vol = volumes[selectedVolume];
      const chapterData = getChapterOutlineData(selectedVolume);
      const chapStatus = getChapterOutlineStatus(selectedVolume);
      const chapters = chapterData?.chapters || [];
      const isChapConfirmed = chapStatus === "confirmed";

      return (
        <div>
          {/* 面包屑导航 */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-4)", fontSize: "var(--text-sm)" }}>
            <button onClick={() => setSelectedVolume(null)} style={{ ...btnSmallStyle, display: "inline-flex", alignItems: "center", gap: "var(--space-1)" }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
                <path d="m15 18-6-6 6-6" />
              </svg>
              卷纲列表
            </button>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>第{selectedVolume + 1}卷 {vol.title}</span>
            {isChapConfirmed && <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 500 }}>已确认</span>}
          </div>

          {/* 卷纲详情 */}
          <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-3)" }}>
              <h4 style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)" }}>卷纲详情</h4>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <button onClick={() => {
                  const resultKey = `planning/volume_outline`;
                  setEditingKey(resultKey);
                  setEditContent(JSON.stringify(volumeData, null, 2));
                }} style={btnSmallStyle}>编辑</button>
                <button onClick={() => setRegenerateKey(`planning/volume_outline`)} style={btnSmallStyle}>重新生成卷纲</button>
                {!isVolConfirmed && (
                  <button onClick={() => setConfirmKey(`planning/volume_outline`)} style={btnPrimaryStyle}>确认卷纲</button>
                )}
              </div>
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.8 }}>
              <div><strong>目标：</strong>{vol.goal || "暂无"}</div>
              {vol.keyEvents && <div><strong>关键事件：</strong>{Array.isArray(vol.keyEvents) ? vol.keyEvents.join("、") : vol.keyEvents}</div>}
              {vol.turningPoint && <div><strong>转折点：</strong>{vol.turningPoint}</div>}
              {vol.climax && <div><strong>高潮：</strong>{vol.climax}</div>}
            </div>
          </div>

          {/* 章纲列表 */}
          <div style={{ background: "var(--bg-base)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-default)" }}>
              <h4 style={{ margin: 0, fontSize: "var(--text-base)", color: "var(--text-primary)" }}>
                章纲列表（{chapters.length} 章）
              </h4>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                {chapters.length > 0 && (
                  <>
                    <button onClick={() => setRegenerateKey(`planning/chapter_outline_vol_${selectedVolume + 1}`)} style={btnSmallStyle}>重新生成章纲</button>
                    {!isChapConfirmed && (
                      <button onClick={() => setConfirmKey(`planning/chapter_outline_vol_${selectedVolume + 1}`)} style={btnPrimaryStyle}>确认本卷章纲</button>
                    )}
                  </>
                )}
              </div>
            </div>

            {chapters.length === 0 ? (
              <div style={{ padding: "var(--space-6)", textAlign: "center" }}>
                <p style={{ color: "var(--text-muted)", marginBottom: "var(--space-4)" }}>本卷章纲尚未生成。</p>
                <button onClick={() => handleRegenerate("planning", `chapter_outline_vol_${selectedVolume + 1}`)} style={btnPrimaryStyle}>
                  生成本卷章纲
                </button>
              </div>
            ) : (
              <div>
                {chapters.map((ch: any, i: number) => {
                  const isChapterExpanded = expandedChapters.has(i);
                  const chars = (ch.characters || []).map((c: any) => c.name).join("、");

                  return (
                    <div key={i} style={{ borderBottom: i < chapters.length - 1 ? "1px solid var(--border-subtle)" : "none" }}>
                      <button onClick={() => toggleChapterExpand(i)} style={{
                        display: "flex", alignItems: "center", gap: "var(--space-3)", width: "100%",
                        padding: "var(--space-3) var(--space-4)", background: "transparent", border: "none",
                        cursor: "pointer", textAlign: "left", color: "var(--text-primary)",
                      }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{
                          width: "0.75rem", height: "0.75rem", flexShrink: 0,
                          transform: isChapterExpanded ? "rotate(90deg)" : "rotate(0deg)",
                          transition: "transform 0.15s",
                        }}>
                          <path d="m9 18 6-6-6-6" />
                        </svg>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 500, minWidth: "3rem" }}>第{i + 1}章</span>
                        <span style={{ fontSize: "var(--text-sm)", flex: 1 }}>{ch.title}</span>
                        {chars && <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>{chars}</span>}
                        {ch.emotionData?.isClimax && <span style={{ fontSize: "var(--text-xs)", color: "var(--warning)" }}>高潮</span>}
                        {ch.emotionData?.isTurningPoint && <span style={{ fontSize: "var(--text-xs)", color: "var(--accent)" }}>转折</span>}
                      </button>

                      {isChapterExpanded && (
                        <div style={{ padding: "0 var(--space-4) var(--space-4)", paddingLeft: "calc(var(--space-4) + 1.5rem)" }}>
                          <div style={{
                            background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)",
                            borderRadius: "var(--radius-sm)", padding: "var(--space-3)",
                            fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.8,
                          }}>
                            {ch.goal && <div><strong>目标：</strong>{ch.goal}</div>}
                            {ch.conflict && <div><strong>冲突：</strong>{ch.conflict}</div>}
                            {ch.emotion && <div><strong>情绪基调：</strong>{ch.emotion}</div>}
                            {ch.hook && <div><strong>章末钩子：</strong>{ch.hook}</div>}
                            {chars && <div><strong>出场角色：</strong>{chars}</div>}
                            {ch.hooksPlanted?.length > 0 && (
                              <div><strong>埋设钩子：</strong>{ch.hooksPlanted.map((h: any) => h.title).join("、")}</div>
                            )}
                            {ch.hooksResolved?.length > 0 && (
                              <div><strong>回收钩子：</strong>{ch.hooksResolved.map((h: any) => h.title).join("、")}</div>
                            )}
                            {ch.foreshadowPlanted?.length > 0 && (
                              <div><strong>埋设伏笔：</strong>{ch.foreshadowPlanted.map((f: any) => f.title).join("、")}</div>
                            )}
                            {ch.foreshadowPayoff?.length > 0 && (
                              <div><strong>回收伏笔：</strong>{ch.foreshadowPayoff.map((f: any) => f.title).join("、")}</div>
                            )}
                            {ch.pleasurePoint && (
                              <div><strong>爽点：</strong>{ch.pleasurePoint.description || ch.pleasurePoint}</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    }

    // 卷列表视图
    return (
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {volumes.map((vol: any, i: number) => {
          const chapData = getChapterOutlineData(i);
          const chapStatus = getChapterOutlineStatus(i);
          const chapCount = chapData?.chapters?.length || 0;
          const isChapConfirmed = chapStatus === "confirmed";

          return (
            <div key={i} style={{
              background: "var(--bg-base)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)", padding: "var(--space-3) var(--space-4)",
              display: "flex", alignItems: "center", gap: "var(--space-3)",
            }}>
              <button onClick={() => setSelectedVolume(i)} style={{
                display: "flex", alignItems: "center", gap: "var(--space-3)", flex: 1,
                background: "transparent", border: "none", cursor: "pointer",
                textAlign: "left", color: "var(--text-primary)", padding: 0,
              }}>
                <span style={{
                  width: "2rem", height: "2rem", borderRadius: "var(--radius-sm)",
                  background: "var(--accent-muted)", color: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "var(--text-sm)", fontWeight: 600, flexShrink: 0,
                }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "var(--text-sm)", fontWeight: 500 }}>{vol.title}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "2px" }}>
                    {vol.goal ? vol.goal.slice(0, 60) + (vol.goal.length > 60 ? "..." : "") : "暂无目标"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                  {chapCount > 0 ? (
                    <span style={{ fontSize: "var(--text-xs)", color: isChapConfirmed ? "var(--success)" : "var(--text-muted)" }}>
                      {chapCount} 章 {isChapConfirmed ? "已确认" : ""}
                    </span>
                  ) : (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>未生成章纲</span>
                  )}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem", color: "var(--text-muted)" }}>
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    );
  };

  // 判断是否有规划阶段数据
  const hasPlanningResults = pipeline?.results.some(r => r.phase === "planning") ?? false;

  if (loading) {
    return (
      <div className="pipeline-loading">
        <div className="loading-spinner"></div>
        <span className="loading-text">加载流程数据...</span>
      </div>
    );
  }

  if (!pipeline) {
    return (
      <div className="pipeline-error">
        <p>无法加载流程数据</p>
        <button onClick={() => navigate(`/novel/${id}`)}>返回工作台</button>
      </div>
    );
  }

  return (
    <div className="pipeline">
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "var(--space-4) var(--space-6)", borderBottom: "1px solid var(--border-default)",
        background: "var(--bg-elevated)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <button onClick={() => navigate(`/novel/${id}`)} style={{
            display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-4)", background: "transparent",
            color: "var(--text-secondary)", border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", cursor: "pointer",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            返回工作台
          </button>
          <h1 style={{
            fontSize: "var(--text-xl)", color: "var(--text-primary)", fontWeight: 600,
          }}>创作流程</h1>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          {pipeline.status === "running" ? (
            <button onClick={handlePause} disabled={pipelineActionLoading !== null} style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
              padding: "var(--space-2) var(--space-4)", background: "transparent",
              color: "var(--text-secondary)", border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)",
              cursor: pipelineActionLoading !== null ? "not-allowed" : "pointer",
              opacity: pipelineActionLoading !== null ? 0.6 : 1,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              {pipelineActionLoading === "pause" ? "暂停中..." : "暂停"}
            </button>
          ) : pipeline.status === "paused" ? (
            <button onClick={handleResume} disabled={pipelineActionLoading !== null} style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-1)",
              padding: "var(--space-2) var(--space-4)", background: "var(--accent)",
              color: "var(--text-inverse)", border: "none",
              borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)",
              cursor: pipelineActionLoading !== null ? "not-allowed" : "pointer",
              opacity: pipelineActionLoading !== null ? 0.6 : 1,
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {pipelineActionLoading === "resume" ? "恢复中..." : "恢复"}
            </button>
          ) : null}
        </div>
      </header>

      <main style={{ padding: "var(--space-6)", maxWidth: "960px", margin: "0 auto" }}>
        <div style={{
          background: "var(--bg-elevated)", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-default)", padding: "var(--space-6)", marginBottom: "var(--space-6)",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)",
          }}>
            <h2 style={{ fontSize: "var(--text-lg)", color: "var(--text-primary)", fontWeight: 600 }}>整体进度</h2>
            <span style={{ fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--accent)" }}>{getOverallProgress()}%</span>
          </div>
          <div style={{
            height: "8px", background: "var(--border-subtle)", borderRadius: "var(--radius-full)",
            overflow: "hidden", position: "relative",
          }}>
            <div style={{
              width: `${getOverallProgress()}%`, height: "100%",
              background: "var(--accent)",
              borderRadius: "var(--radius-full)", transition: "width var(--transition-slow)",
            }} />
          </div>
          <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
            状态: {pipeline.status === "running" ? "运行中" : pipeline.status === "paused" ? "已暂停" : pipeline.status === "completed" ? "已完成" : "失败"}
          </div>
          {pipeline.status === "failed" && pipeline.lastError && (
            <div style={{
              marginTop: "var(--space-2)",
              padding: "var(--space-3)",
              background: "var(--error-subtle)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--error-muted)",
              fontSize: "var(--text-sm)",
              color: "var(--error)",
            }}>
              {translatePipelineError(pipeline.lastError)}
            </div>
          )}
        </div>

        <div className="pipeline-stages">
          {pipeline.stages.map((stage, index) => (
            <React.Fragment key={stage.id}>
              {index > 0 && <div className="pipeline-connector">→</div>}
              <div className={`pipeline-stage ${stage.status === "in_progress" ? "active" : stage.status}`}>
              <div className="pipeline-stage-header">
                <div className="pipeline-stage-dot" />
                <span className="pipeline-stage-name">{stage.name}</span>
                <span className="pipeline-stage-status">
                  {stage.status === "completed" ? "已完成" : stage.status === "in_progress" ? "进行中" : stage.status === "failed" ? "失败" : "待处理"}
                </span>
                {stage.status === "in_progress" && (
                  <span className="pipeline-stage-status" style={{ color: "var(--accent-hover)" }}>{stage.progress}%</span>
                )}
              </div>

              <div className="pipeline-chapters">
                {stage.steps.map((step) => (
                  <div key={step.id} className={`pipeline-chapter ${step.status === "in_progress" ? "active" : step.status}`}>
                    <div className="pipeline-chapter-dot" />
                    <span className="pipeline-chapter-title">{step.name}</span>
                    {step.message && (
                      <span className="pipeline-chapter-status">{step.message}</span>
                    )}
                  </div>
                ))}
              </div>

              {stage.status === "completed" && (
                <div style={{ padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  请在下方「成果查看」区域对每个步骤进行确认、编辑或重新生成。
                </div>
              )}
            </div>
            </React.Fragment>
          ))}
        </div>

        <section style={{
          marginTop: "var(--space-6)",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: "var(--space-4)", padding: "var(--space-4) var(--space-5)",
            borderBottom: "1px solid var(--border-default)",
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "var(--text-lg)", color: "var(--text-primary)" }}>成果查看</h2>
              <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-sm)", color: "var(--text-muted)" }}>
                完成后这里会展示规划、结构、正文样章和本次创作使用的资产。
              </p>
            </div>
            <button onClick={() => navigate(`/novel/${id}/write`)} style={{
              padding: "var(--space-2) var(--space-3)", background: "var(--accent)", color: "var(--text-inverse)",
              border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer",
            }}>
              查看章节
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr", gap: "var(--space-4)", padding: "var(--space-5)" }}>
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              {/* 卷纲规划菜单（planning 阶段专用） */}
              {hasPlanningResults && (
                <article style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--bg-base)",
                  overflow: "hidden",
                }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "var(--space-3) var(--space-4)",
                    borderBottom: "1px solid var(--border-default)",
                    background: "var(--bg-elevated)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                      <strong style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>完整规划</strong>
                      {getVolumeOutlineStatus() === "confirmed" && (
                        <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 500 }}>卷纲已确认</span>
                      )}
                    </div>
                    {selectedVolume !== null && (
                      <button onClick={() => setSelectedVolume(null)} style={btnSmallStyle}>
                        返回卷纲列表
                      </button>
                    )}
                  </div>
                  <div style={{ padding: "var(--space-4)" }}>
                    {renderPlanningSection()}

                    {/* 编辑面板 */}
                    {editingKey?.startsWith("planning/") && (
                      <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                          <button onClick={() => setJsonEditMode(false)} style={{ ...btnSmallStyle, background: !jsonEditMode ? "var(--accent)" : undefined, color: !jsonEditMode ? "var(--text-inverse)" : undefined }}>结构化视图</button>
                          <button onClick={() => setJsonEditMode(true)} style={{ ...btnSmallStyle, background: jsonEditMode ? "var(--accent)" : undefined, color: jsonEditMode ? "var(--text-inverse)" : undefined }}>JSON 编辑</button>
                        </div>
                        {jsonEditMode ? (
                          <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ width: "100%", minHeight: "300px", fontFamily: "monospace", fontSize: "0.8125rem", lineHeight: 1.5, padding: "var(--space-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical" }} />
                        ) : (
                          <div style={{ padding: "0.75rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", maxHeight: "300px", overflow: "auto" }}>
                            <SmartJsonViewer data={(() => { try { return JSON.parse(editContent); } catch { return editContent; } })()} maxDepth={4} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button onClick={() => handleSaveUserContent("planning", editingKey.split("/")[1])} disabled={actionLoading === editingKey} style={btnPrimaryStyle}>{actionLoading === editingKey ? "保存中..." : "保存"}</button>
                          <button onClick={() => { setEditingKey(null); setEditContent(""); setJsonEditMode(false); }} style={btnSmallStyle}>取消</button>
                        </div>
                      </div>
                    )}

                    {/* 重新生成面板 */}
                    {regenerateKey?.startsWith("planning/") && (
                      <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                        <input type="text" placeholder="输入修改意见（可选），如：增加更多伏笔、调整节奏" value={regenerateHint} onChange={(e) => setRegenerateHint(e.target.value)} style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button onClick={() => handleRegenerate("planning", regenerateKey.split("/")[1])} disabled={actionLoading === regenerateKey} style={btnPrimaryStyle}>{actionLoading === regenerateKey ? "生成中..." : "确认重新生成"}</button>
                          <button onClick={() => { setRegenerateKey(null); setRegenerateHint(""); }} style={btnSmallStyle}>取消</button>
                        </div>
                      </div>
                    )}

                    {/* 确认面板 */}
                    {confirmKey?.startsWith("planning/") && (
                      <div style={{ marginTop: "var(--space-4)", padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                        <textarea placeholder="反馈意见（可选），如：整体不错，但第一卷节奏需要加快" value={confirmFeedback} onChange={(e) => setConfirmFeedback(e.target.value)} style={{ width: "100%", minHeight: "60px", padding: "var(--space-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical" }} />
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button onClick={() => handleConfirm("planning", confirmKey.split("/")[1])} disabled={actionLoading === confirmKey} style={{ ...btnPrimaryStyle, background: "var(--success)", borderColor: "var(--success)" }}>{actionLoading === confirmKey ? "确认中..." : "确认通过"}</button>
                          <button onClick={() => { setConfirmKey(null); setConfirmFeedback(""); }} style={btnSmallStyle}>取消</button>
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              )}

              {/* 其他阶段的成果展示（非 planning 阶段） */}
              {pipeline.results.filter(r => r.phase !== "planning").length > 0 ? pipeline.results.filter(r => r.phase !== "planning").map((result) => {
                const output = parseOutput(result.output);
                const resultKey = `${result.phase}/${result.step}`;
                const isExpanded = expandedResults.has(resultKey);
                const isEditing = editingKey === resultKey;
                const isRegenerating = regenerateKey === resultKey;
                const isConfirming = confirmKey === resultKey;
                const fullJson = output ? JSON.stringify(output, null, 2) : "";
                const isConfirmed = result.status === "confirmed";
                const isLoading = actionLoading === resultKey;

                return (
                  <article key={resultKey} style={{
                    border: `1px solid ${isConfirmed ? "var(--success-border)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-sm)", background: isConfirmed ? "var(--success-subtle)" : "var(--bg-base)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "var(--space-3)", gap: "var(--space-2)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <strong style={{ color: "var(--text-primary)", fontSize: "0.875rem" }}>{translatePipelinePhaseLabel(result.phase)} / {translatePipelineStepLabel(result.step)}</strong>
                        {isConfirmed && <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 500 }}>已确认</span>}
                        {result.selfScore != null && <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>AI: {result.selfScore}/10</span>}
                      </div>
                      <div style={{ display: "flex", gap: "0.375rem" }}>
                        <button onClick={() => toggleExpand(resultKey)} style={btnSmallStyle}>{isExpanded ? "收起" : "展开"}</button>
                        {!isConfirmed && (
                          <>
                            <button onClick={() => { setEditingKey(resultKey); setEditContent(fullJson); setJsonEditMode(false); }} style={btnSmallStyle}>编辑</button>
                            <button onClick={() => setRegenerateKey(resultKey)} style={btnSmallStyle}>重新生成</button>
                            <button onClick={() => setConfirmKey(resultKey)} style={{ ...btnSmallStyle, background: "var(--accent)", color: "var(--text-inverse)" }}>确认</button>
                          </>
                        )}
                      </div>
                    </div>

                    <pre style={{ margin: 0, padding: "0 var(--space-3) var(--space-3)", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "var(--text-sm)", lineHeight: 1.6, color: "var(--text-secondary)" }}>
                      {summarizeResult(result.step, output)}
                    </pre>

                    {isExpanded && !isEditing && (
                      <div style={{ padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)", maxHeight: "400px", overflow: "auto" }}>
                        <SmartJsonViewer data={output} maxDepth={4} />
                      </div>
                    )}

                    {isEditing && (
                      <div style={{ padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                          <button onClick={() => setJsonEditMode(false)} style={{ ...btnSmallStyle, background: !jsonEditMode ? "var(--accent)" : undefined, color: !jsonEditMode ? "var(--text-inverse)" : undefined }}>结构化视图</button>
                          <button onClick={() => setJsonEditMode(true)} style={{ ...btnSmallStyle, background: jsonEditMode ? "var(--accent)" : undefined, color: jsonEditMode ? "var(--text-inverse)" : undefined }}>JSON 编辑</button>
                        </div>
                        {jsonEditMode ? (
                          <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} style={{ width: "100%", minHeight: "300px", fontFamily: "monospace", fontSize: "0.8125rem", lineHeight: 1.5, padding: "var(--space-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical" }} />
                        ) : (
                          <div style={{ padding: "0.75rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", background: "var(--bg-surface)", maxHeight: "300px", overflow: "auto" }}>
                            <SmartJsonViewer data={output} maxDepth={4} />
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button onClick={() => handleSaveUserContent(result.phase, result.step)} disabled={isLoading} style={{ ...btnSmallStyle, background: "var(--accent)", color: "var(--text-inverse)" }}>{isLoading ? "保存中..." : "保存"}</button>
                          <button onClick={() => { setEditingKey(null); setEditContent(""); setJsonEditMode(false); }} style={btnSmallStyle}>取消</button>
                        </div>
                      </div>
                    )}

                    {isRegenerating && (
                      <div style={{ padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                        <input type="text" placeholder="输入修改意见（可选），如：主角改成女性、增加悬疑元素" value={regenerateHint} onChange={(e) => setRegenerateHint(e.target.value)} style={{ width: "100%", padding: "var(--space-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--bg-surface)", color: "var(--text-primary)" }} />
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button onClick={() => handleRegenerate(result.phase, result.step)} disabled={isLoading} style={{ ...btnSmallStyle, background: "var(--accent)", color: "var(--text-inverse)" }}>{isLoading ? "生成中..." : "确认重新生成"}</button>
                          <button onClick={() => { setRegenerateKey(null); setRegenerateHint(""); }} style={btnSmallStyle}>取消</button>
                        </div>
                      </div>
                    )}

                    {isConfirming && (
                      <div style={{ padding: "var(--space-3)", borderTop: "1px solid var(--border-subtle)" }}>
                        <textarea placeholder="反馈意见（可选），如：整体不错，但反派动机需要加强" value={confirmFeedback} onChange={(e) => setConfirmFeedback(e.target.value)} style={{ width: "100%", minHeight: "60px", padding: "var(--space-2)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", fontSize: "0.8125rem", background: "var(--bg-surface)", color: "var(--text-primary)", resize: "vertical" }} />
                        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                          <button onClick={() => handleConfirm(result.phase, result.step)} disabled={isLoading} style={{ ...btnSmallStyle, background: "var(--success)", color: "#fff" }}>{isLoading ? "确认中..." : "确认通过"}</button>
                          <button onClick={() => { setConfirmKey(null); setConfirmFeedback(""); }} style={btnSmallStyle}>取消</button>
                        </div>
                      </div>
                    )}

                    {/* 引用信息面板 */}
                    {(() => {
                      const refItems = parseMetadata(result.metadata);
                      const isRefExpanded = expandedRefs.has(resultKey);
                      if (refItems.length === 0) return null;
                      return (
                        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <button
                            onClick={() => toggleRefExpand(resultKey)}
                            style={{
                              display: "flex", alignItems: "center", gap: "var(--space-1)",
                              width: "100%", padding: "var(--space-2) var(--space-3)",
                              background: "transparent", border: "none", cursor: "pointer",
                              fontSize: "var(--text-xs)", color: "var(--text-muted)",
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{
                              width: "0.75rem", height: "0.75rem", flexShrink: 0,
                              transform: isRefExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 0.15s",
                            }}>
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                            引用信息（{refItems.length} 项）
                          </button>
                          {isRefExpanded && (
                            <div style={{
                              display: "flex", flexWrap: "wrap", gap: "var(--space-1)",
                              padding: "0 var(--space-3) var(--space-2)",
                            }}>
                              {refItems.map((item, idx) => (
                                <span key={idx} style={{
                                  display: "inline-flex", alignItems: "center", gap: "2px",
                                  padding: "2px 8px", borderRadius: "var(--radius-full)",
                                  background: "var(--accent-muted)", color: "var(--accent)",
                                  fontSize: "var(--text-xs)", whiteSpace: "nowrap",
                                }}>
                                  {getAssetTypeLabel(item.assetType)}:{item.title}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </article>
                );
              }) : (
                !hasPlanningResults && <p style={{ margin: 0, color: "var(--text-muted)" }}>还没有阶段成果。</p>
              )}
            </div>

            <aside style={{
              border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)",
              padding: "var(--space-3)", background: "var(--bg-base)", alignSelf: "start",
            }}>
              <h3 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-base)", color: "var(--text-primary)" }}>本次使用资产</h3>
              <div style={{ display: "grid", gap: "var(--space-2)", maxHeight: "320px", overflow: "auto" }}>
                {usage.length > 0 ? usage.slice(0, 18).map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", fontSize: "var(--text-sm)" }}>
                    <span style={{ color: "var(--text-primary)" }}>{item.title}</span>
                    <em style={{ fontStyle: "normal", color: "var(--text-muted)" }}>{translateAssetType(item.assetType)}</em>
                  </div>
                )) : (
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "var(--text-sm)" }}>暂无使用记录。</p>
                )}
              </div>
            </aside>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PipelinePage;

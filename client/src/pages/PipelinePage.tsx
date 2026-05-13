import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";

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
  results: Array<{
    phase: string;
    step: string;
    status: string;
    selfScore?: number | null;
    selfComment?: string | null;
    output?: string | null;
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
  phaseResults?: Array<{
    id: string;
    phase: string;
    step: string;
    status: string;
    selfScore?: number | null;
    selfComment?: string | null;
    output?: string | null;
  }>;
}

const PipelinePage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [usage, setUsage] = useState<Array<{ id: string; assetType: string; title: string; usageStage: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadPipeline(id);
    }
  }, [id]);

  useEffect(() => {
    if (!id || pipeline?.status === "completed" || pipeline?.status === "failed") return;
    const timer = window.setInterval(() => {
      loadPipeline(id, true);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [id, pipeline?.status]);

  const loadPipeline = async (novelId: string, silent = false) => {
    try {
      if (!silent) setLoading(true);
      const data = await api.get<PipelineJobResponse | null>(`/api/pipeline/novel/${novelId}`);
      setPipeline(data ? mapPipelineJob(data) : null);
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
    try {
      await api.post(`/api/pipeline/${pipeline.id}/pause`);
      loadPipeline(id!);
    } catch (error) {
      console.error("暂停失败:", error);
    }
  };

  const handleResume = async () => {
    if (!pipeline) return;
    try {
      await api.post(`/api/pipeline/${pipeline.id}/resume`);
      loadPipeline(id!);
    } catch (error) {
      console.error("恢复失败:", error);
    }
  };

  const handleConfirm = async (stageId: string) => {
    if (!pipeline) return;
    try {
      const firstStep = pipeline.stages.find((stage) => stage.id === stageId)?.steps[0];
      if (!firstStep) return;
      await api.post(`/api/pipeline/${pipeline.id}/confirm`, { phase: stageId, step: firstStep.id });
      loadPipeline(id!);
    } catch (error) {
      console.error("确认失败:", error);
    }
  };

  const handleRegenerate = async (stageId: string) => {
    if (!pipeline) return;
    try {
      const firstStep = pipeline.stages.find((stage) => stage.id === stageId)?.steps[0];
      if (!firstStep) return;
      await api.post(`/api/pipeline/${pipeline.id}/regenerate`, { phase: stageId, step: firstStep.id });
      loadPipeline(id!);
    } catch (error) {
      console.error("重新生成失败:", error);
    }
  };

  const mapPipelineJob = (job: PipelineJobResponse): PipelineData => {
    const phaseLabels: Record<string, string> = {
      planning: "规划阶段",
      structuring: "结构化阶段",
      writing: "正文生成",
      quality_check: "质量校验",
    };
    const stepLabels: Record<string, string> = {
      outline: "故事大纲",
      worldview: "世界观设定",
      characters: "人物设定",
      style: "写作风格",
      volume: "卷纲规划",
      chapter_outline: "章纲规划",
      mainline_hook: "主线钩子",
      chapter_drafts: "正文样章",
      waiting_confirm: "等待确认",
    };
    const phases = ["planning", "structuring", "writing", "quality_check"];
    const results = job.phaseResults ?? [];
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
            name: stepLabels[result.step] ?? result.step,
            status: (result.status === "completed" || result.status === "confirmed" ? "completed" : "pending") as PipelineStep["status"],
            message: result.selfComment || undefined,
          }))
        : [{
            id: isCurrent ? job.currentStep : phase,
            name: stepLabels[isCurrent ? job.currentStep : phase] ?? (isCurrent ? job.currentStep : phaseLabels[phase]),
            status: (isCurrent && job.status === "running" ? "in_progress" : "pending") as PipelineStep["status"],
            message: isCurrent ? "正在处理当前步骤" : undefined,
          }];
      return {
        id: phase,
        name: phaseLabels[phase] ?? phase,
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
      results,
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
    if (step === "chapter_outline" && Array.isArray(output.chapterOutlines)) {
      return output.chapterOutlines.flatMap((volume: any) => volume.chapters || []).slice(0, 6).map((item: any, index: number) => `第${index + 1}章 ${item.title}：${item.goal || item.conflict || ""}`).join("\n");
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
    <div className="pipeline-page" style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23d4a574' fill-opacity='0.05'%3E%3Cpath d='M50 0L51 100H49L50 0z' /%3E%3Cpath d='M0 50H100V52H0z' /%3E%3C/g%3E%3C/svg%3E\")",
    }}>
      <header className="pipeline-header" style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "1rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-card)",
        boxShadow: "var(--shadow-sm)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button className="btn-back" onClick={() => navigate(`/novel/${id}`)} style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.875rem",
            cursor: "pointer",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <path d="m15 18-6-6 6-6" />
            </svg>
            返回工作台
          </button>
          <h1 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "1.5rem",
            color: "var(--text-primary)",
            letterSpacing: "0.05em",
          }}>创作流程</h1>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: "0.5rem" }}>
          {pipeline.status === "running" ? (
            <button className="btn-pause" onClick={handlePause} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              暂停
            </button>
          ) : pipeline.status === "paused" ? (
            <button className="btn-resume" onClick={handleResume} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              恢复
            </button>
          ) : null}
        </div>
      </header>

      <main className="pipeline-content" style={{
        maxWidth: "960px",
        margin: "0 auto",
        padding: "2rem",
      }}>
        <div className="pipeline-progress" style={{
          background: "var(--bg-card)",
          borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border)",
          padding: "1.5rem",
          marginBottom: "2rem",
        }}>
          <div className="progress-header" style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1rem",
          }}>
            <h2 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.125rem",
              color: "var(--text-primary)",
            }}>整体进度</h2>
            <span className="progress-percentage" style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "var(--accent)",
              fontFamily: "var(--font-serif)",
            }}>{getOverallProgress()}%</span>
          </div>
          <div className="progress-bar" style={{
            height: "8px",
            background: "var(--border-light)",
            borderRadius: "var(--radius-full)",
            overflow: "hidden",
            position: "relative",
          }}>
            <div
              className="progress-fill"
              style={{
                width: `${getOverallProgress()}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--accent), var(--accent-light))",
                borderRadius: "var(--radius-full)",
                transition: "width var(--transition-slow)",
              }}
            />
          </div>
          <div className="progress-status" style={{
            marginTop: "0.75rem",
            fontSize: "0.875rem",
            color: "var(--text-secondary)",
          }}>
            状态: {pipeline.status === "running" ? "运行中" : pipeline.status === "paused" ? "已暂停" : pipeline.status === "completed" ? "已完成" : "失败"}
          </div>
        </div>

        <div className="pipeline-stages" style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}>
          {pipeline.stages.map((stage, index) => (
            <div key={stage.id} className={`stage-card ${stage.status}`} style={{
              background: "var(--bg-card)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border)",
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{
                position: "absolute",
                top: "0.5rem",
                left: "0.5rem",
                right: "0.5rem",
                bottom: "0.5rem",
                border: "1px solid var(--border-light)",
                borderRadius: "var(--radius-md)",
                pointerEvents: "none",
              }} />
              <div className="stage-header" style={{
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                padding: "1rem 1.5rem",
                borderBottom: "1px solid var(--border-light)",
              }}>
                <div className="stage-icon" style={{
                  width: "40px",
                  height: "40px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  background: stage.status === "completed" ? "rgba(74,154,74,0.1)" : stage.status === "in_progress" ? "rgba(139,69,19,0.1)" : stage.status === "failed" ? "rgba(212,74,74,0.1)" : "rgba(138,122,106,0.1)",
                  color: stage.status === "completed" ? "var(--success)" : stage.status === "in_progress" ? "var(--accent)" : stage.status === "failed" ? "var(--error)" : "var(--text-muted)",
                }}>
                  {getStageIcon(stage.status)}
                </div>
                <div className="stage-info" style={{ flex: 1 }}>
                  <h3 style={{
                    fontFamily: "var(--font-serif)",
                    fontSize: "1rem",
                    color: "var(--text-primary)",
                    marginBottom: "0.25rem",
                  }}>{stage.name}</h3>
                  <span className="stage-status" style={{
                    fontSize: "0.75rem",
                    color: stage.status === "completed" ? "var(--success)" : stage.status === "in_progress" ? "var(--accent)" : stage.status === "failed" ? "var(--error)" : "var(--text-muted)",
                  }}>
                    {stage.status === "completed" ? "已完成" : stage.status === "in_progress" ? "进行中" : stage.status === "failed" ? "失败" : "待处理"}
                  </span>
                </div>
                {stage.status === "in_progress" && (
                  <div className="stage-progress" style={{
                    fontSize: "1.25rem",
                    fontWeight: 700,
                    color: "var(--accent)",
                    fontFamily: "var(--font-serif)",
                  }}>
                    <span>{stage.progress}%</span>
                  </div>
                )}
              </div>

              <div className="stage-steps" style={{ padding: "0.75rem 1.5rem" }}>
                {stage.steps.map((step) => (
                  <div key={step.id} className={`step-item ${step.status}`} style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--border-light)",
                  }}>
                    <div className="step-icon" style={{
                      width: "20px",
                      height: "20px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: step.status === "completed" ? "var(--success)" : step.status === "in_progress" ? "var(--accent)" : step.status === "failed" ? "var(--error)" : "var(--text-muted)",
                    }}>
                      {getStepStatusIcon(step.status)}
                    </div>
                    <div className="step-content" style={{ flex: 1 }}>
                      <span className="step-name" style={{
                        fontSize: "0.875rem",
                        color: "var(--text-primary)",
                      }}>{step.name}</span>
                      {step.message && (
                        <span className="step-message" style={{
                          display: "block",
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          marginTop: "0.125rem",
                        }}>{step.message}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {stage.status === "completed" && (
                <div className="stage-actions" style={{
                  display: "flex",
                  gap: "0.75rem",
                  padding: "1rem 1.5rem",
                  borderTop: "1px solid var(--border-light)",
                }}>
                  <button
                    className="btn-confirm"
                    onClick={() => handleConfirm(stage.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.5rem 1rem",
                      background: "var(--accent)",
                      color: "var(--text-inverse)",
                      border: "none",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    确认
                  </button>
                  <button
                    className="btn-regenerate"
                    onClick={() => handleRegenerate(stage.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      padding: "0.5rem 1rem",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      fontSize: "0.8125rem",
                      cursor: "pointer",
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                    重新生成
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <section style={{
          marginTop: "2rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
          }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.125rem", color: "var(--text-primary)" }}>成果查看</h2>
              <p style={{ margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                完成后这里会展示规划、结构、正文样章和本次创作使用的资产。
              </p>
            </div>
            <button onClick={() => navigate(`/novel/${id}/write`)} style={{
              padding: "0.5rem 0.875rem",
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}>
              查看章节
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr", gap: "1rem", padding: "1.25rem" }}>
            <div style={{ display: "grid", gap: "0.875rem" }}>
              {pipeline.results.length > 0 ? pipeline.results.map((result) => {
                const output = parseOutput(result.output);
                return (
                  <article key={`${result.phase}-${result.step}`} style={{
                    border: "1px solid var(--border-light)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.875rem",
                    background: "var(--bg-primary)",
                  }}>
                    <strong style={{ display: "block", marginBottom: "0.375rem", color: "var(--text-primary)" }}>
                      {result.phase} / {result.step}
                    </strong>
                    <pre style={{
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      fontFamily: "inherit",
                      fontSize: "0.8125rem",
                      lineHeight: 1.6,
                      color: "var(--text-secondary)",
                    }}>{summarizeResult(result.step, output)}</pre>
                  </article>
                );
              }) : (
                <p style={{ margin: 0, color: "var(--text-muted)" }}>还没有阶段成果。</p>
              )}
            </div>

            <aside style={{
              border: "1px solid var(--border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "0.875rem",
              background: "var(--bg-primary)",
              alignSelf: "start",
            }}>
              <h3 style={{ margin: "0 0 0.75rem", fontSize: "0.9375rem", color: "var(--text-primary)" }}>本次使用资产</h3>
              <div style={{ display: "grid", gap: "0.5rem", maxHeight: "320px", overflow: "auto" }}>
                {usage.length > 0 ? usage.slice(0, 18).map((item) => (
                  <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.8125rem" }}>
                    <span style={{ color: "var(--text-primary)" }}>{item.title}</span>
                    <em style={{ fontStyle: "normal", color: "var(--text-muted)" }}>{item.assetType}</em>
                  </div>
                )) : (
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.8125rem" }}>暂无使用记录。</p>
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

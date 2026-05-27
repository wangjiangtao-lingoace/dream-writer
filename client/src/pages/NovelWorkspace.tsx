import React, { useState, useEffect } from "react";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { toast } from "../components/ui/toast";
import CharacterCard from "../components/CharacterCard";
import WorldviewEditor from "../components/WorldviewEditor";
import WorldviewViewer from "../components/WorldviewViewer";
import OutlineViewer from "../components/OutlineViewer";
import RelationshipMatrix from "../components/RelationshipMatrix";
import KnowledgeHub from "../components/KnowledgeHub";
import VolumeEditor from "../components/VolumeEditor";
import MemoryPanel from "../components/MemoryPanel";
import ConsistencyPanel from "../components/ConsistencyPanel";
import StylePanel from "../components/StylePanel";
import { AIPanel } from "../components/layout/AIPanel";
import {
  DashboardPanel,
  WorkspaceSidebar,
  MainlinePanel,
  HookPanel,
  WritePanel,
  AnalysisPanel,
} from "../components/workspace";
import type { WorkspaceTab, TabGroup, NovelDetail } from "../components/workspace";
import "../styles/pages/workspace.css";

const NovelWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const [novel, setNovel] = useState<NovelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    (tab as WorkspaceTab) || "dashboard"
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState("");
  const [editingInspiration, setEditingInspiration] = useState(false);
  const [inspirationDraft, setInspirationDraft] = useState("");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [worldviews, setWorldviews] = useState<any[]>([]);
  const [editingWorldviewId, setEditingWorldviewId] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadNovel(id);
    }
  }, [id]);

  useEffect(() => {
    if (tab) {
      setActiveTab(tab as WorkspaceTab);
    }
  }, [tab]);

  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notice]);

  const loadNovel = async (novelId: string) => {
    try {
      setLoading(true);
      const [data, worldviewsData] = await Promise.all([
        api.get<NovelDetail>(`/api/novels/${novelId}`),
        api.get<any[]>(`/api/worldviews?novelId=${encodeURIComponent(novelId)}`).catch(() => []),
      ]);
      setNovel(data);
      setWorldviews(worldviewsData);
    } catch (error) {
      console.error("加载作品失败:", error);
      toast.error("作品不存在或加载失败");
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    navigate(`/novel/${id}/${tab}`, { replace: true });
  };

  const handleNotice = (msg: string) => {
    setNotice(msg);
  };

  const handleSave = async () => {
    if (!novel) return;
    try {
      await api.put(`/api/novels/${id}`, {
        title: novel.title,
        genre: novel.genre,
        inspiration: novel.inspiration,
        outline: novel.outline,
      });
      setNotice("保存成功");
    } catch (error) {
      console.error("保存失败:", error);
      toast.error("保存失败，请重试");
    }
  };

  const tabGroups: TabGroup[] = [
    {
      label: "规划",
      tabs: [
        {
          key: "dashboard",
          label: "总控",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          ),
        },
        {
          key: "outline",
          label: "大纲",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          ),
        },
        {
          key: "worldviews",
          label: "世界观",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          ),
        },
        {
          key: "characters",
          label: "人物",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          ),
        },
        {
          key: "style",
          label: "风格",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <circle cx="17.5" cy="10.5" r="2.5" />
              <circle cx="8.5" cy="7.5" r="2.5" />
              <circle cx="6.5" cy="12.5" r="2.5" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
          ),
        },
      ],
    },
    {
      label: "结构",
      tabs: [
        {
          key: "volumes",
          label: "卷纲",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          ),
        },
        {
          key: "mainlines",
          label: "主线",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          ),
        },
        {
          key: "hooks",
          label: "钩子",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 22V8" />
              <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              <circle cx="12" cy="5" r="3" />
            </svg>
          ),
        },
      ],
    },
    {
      label: "创作",
      tabs: [
        {
          key: "write",
          label: "写作",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          ),
        },
        {
          key: "analysis",
          label: "拆书",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
          ),
        },
      ],
    },
    {
      label: "管理",
      tabs: [
        {
          key: "knowledge",
          label: "知识库",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              <path d="M8 7h8" />
              <path d="M8 11h6" />
            </svg>
          ),
        },
        {
          key: "memory",
          label: "记忆",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
              <path d="M12 2a10 10 0 0 1 10 10" />
              <circle cx="12" cy="12" r="6" />
            </svg>
          ),
        },
        {
          key: "consistency",
          label: "校验",
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          ),
        },
      ],
    },
  ];

  if (loading) {
    return (
      <div className="workspace-loading">
        <div className="loading-spinner"></div>
        <span className="loading-text">加载中...</span>
      </div>
    );
  }

  if (!novel) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardPanel novelId={id!} />;

      case "outline":
        return (
          <div className="outline-panel">
            <div className="panel-header">
              <h2>作品大纲</h2>
              <button className="btn-edit" onClick={() => {
                if (editingOutline) {
                  api.put(`/api/novels/${id}`, { outline: outlineDraft })
                    .then(() => {
                      setNovel(prev => prev ? { ...prev, outline: outlineDraft } : null);
                      setEditingOutline(false);
                      setNotice("大纲已保存");
                    })
                    .catch(() => toast.error("保存失败"));
                } else {
                  setOutlineDraft(novel.outline || "");
                  setEditingOutline(true);
                }
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  {editingOutline ? (
                    <path d="M20 6L9 17l-5-5" />
                  ) : (
                    <>
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </>
                  )}
                </svg>
                {editingOutline ? "保存" : "编辑"}
              </button>
            </div>
            <div className="outline-content">
              <div className="outline-section">
                <h3>作品信息</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">标题</span>
                    <span className="info-value">{novel.title}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">类型</span>
                    <span className="info-value">{novel.genre || "未设置"}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">状态</span>
                    <span className="info-value">{novel.status === "drafting" ? "创作中" : novel.status}</span>
                  </div>
                </div>
              </div>
              <div className="outline-section">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0 }}>创作灵感</h3>
                  <button
                    className="btn-edit"
                    onClick={() => {
                      if (editingInspiration) {
                        api.put(`/api/novels/${id}`, { inspiration: inspirationDraft })
                          .then(() => {
                            setNovel(prev => prev ? { ...prev, inspiration: inspirationDraft } : null);
                            setEditingInspiration(false);
                            setNotice("灵感已保存");
                          })
                          .catch(() => toast.error("保存失败"));
                      } else {
                        setInspirationDraft(novel.inspiration || "");
                        setEditingInspiration(true);
                      }
                    }}
                    style={{ display: "flex", alignItems: "center", gap: "0.25rem", padding: "0.25rem 0.5rem", fontSize: "0.8125rem", color: "var(--accent)", background: "none", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}
                  >
                    {editingInspiration ? "保存" : "编辑"}
                  </button>
                </div>
                {editingInspiration ? (
                  <textarea
                    value={inspirationDraft}
                    onChange={(e) => setInspirationDraft(e.target.value)}
                    placeholder="请输入创作灵感，越详细越好..."
                    rows={6}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      marginTop: "0.5rem",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      fontSize: "0.875rem",
                      resize: "vertical",
                      lineHeight: 1.7,
                    }}
                  />
                ) : (
                  <p style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{novel.inspiration || "暂无灵感描述"}</p>
                )}
              </div>
              <div className="outline-section">
                <h3>故事大纲</h3>
                {editingOutline ? (
                  <textarea
                    value={outlineDraft}
                    onChange={(e) => setOutlineDraft(e.target.value)}
                    placeholder="请输入故事大纲..."
                    rows={10}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      background: "var(--bg-base)",
                      border: "1px solid var(--border-default)",
                      borderRadius: "var(--radius-md)",
                      color: "var(--text-primary)",
                      fontSize: "1rem",
                      resize: "vertical",
                      minHeight: "200px",
                    }}
                  />
                ) : (
                  <OutlineViewer
                    content={novel.outline || ""}
                    onEdit={() => {
                      setOutlineDraft(novel.outline || "");
                      setEditingOutline(true);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        );

      case "volumes":
        return <VolumeEditor novelId={id!} onNotice={handleNotice} />;

      case "characters":
        return (
          <div className="characters-panel">
            <CharacterCard novelId={id!} onNotice={handleNotice} />
            <div style={{ marginTop: "2rem" }}>
              <RelationshipMatrix novelId={id!} onNotice={handleNotice} />
            </div>
          </div>
        );

      case "worldviews":
        return (
          <div className="worldviews-panel">
            <div className="panel-header">
              <h2>世界观设定</h2>
              <p className="panel-desc">管理作品的世界观、规则、力量体系等设定。</p>
            </div>
            {worldviews.length === 0 ? (
              <div className="empty-state">
                <p>暂无世界观数据，请点击下方按钮创建。</p>
                <button
                  className="btn-primary"
                  onClick={() => setEditingWorldviewId("new")}
                  style={{
                    padding: "0.5rem 1rem",
                    background: "var(--accent)",
                    color: "var(--text-inverse)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  创建世界观
                </button>
              </div>
            ) : (
              <div className="worldviews-list">
                {worldviews.map((worldview) => (
                  <div key={worldview.id} className="worldview-item">
                    {editingWorldviewId === worldview.id ? (
                      <WorldviewEditor
                        novelId={id!}
                        onNotice={handleNotice}
                      />
                    ) : (
                      <WorldviewViewer
                        worldview={worldview}
                        onEdit={() => setEditingWorldviewId(worldview.id)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "memory":
        return <MemoryPanel novelId={id!} onNotice={handleNotice} />;

      case "consistency":
        return <ConsistencyPanel novelId={id!} chapters={novel.chapters} onNotice={handleNotice} />;

      case "style":
        return <StylePanel novelId={id!} onNotice={handleNotice} />;

      case "knowledge":
        return <KnowledgeHub novelId={id!} onNotice={handleNotice} />;

      case "mainlines":
        return <MainlinePanel novelId={id!} />;

      case "hooks":
        return <HookPanel novelId={id!} />;

      case "write":
        return <WritePanel novelId={id!} activeChapterId={activeChapterId} />;

      case "analysis":
        return <AnalysisPanel novelId={id!} />;

      default:
        return <div>请选择功能模块</div>;
    }
  };

  const getAIActions = () => {
    const actions: Record<string, Array<{ key: string; label: string; icon: string; description: string; shortcut?: string; primary?: boolean }>> = {
      dashboard: [
        { key: "analyze", label: "分析进度", icon: "📊", description: "分析当前创作进度和下一步建议", shortcut: "⌘⇧A", primary: true },
      ],
      outline: [
        { key: "generate-outline", label: "生成大纲", icon: "📝", description: "AI 根据已有信息生成完整大纲", shortcut: "⌘⇧G", primary: true },
        { key: "expand-outline", label: "扩展大纲", icon: "📖", description: "扩展现有大纲的细节" },
      ],
      characters: [
        { key: "generate-character", label: "生成人物卡", icon: "👤", description: "AI 生成新人物设定", shortcut: "⌘⇧R", primary: true },
        { key: "analyze-relations", label: "人物关系分析", icon: "🔗", description: "分析人物之间的关系网络" },
      ],
      write: [
        { key: "continue-write", label: "续写本章", icon: "✍️", description: "AI 根据上下文续写内容", shortcut: "⌘↵", primary: true },
        { key: "consistency-check", label: "一致性检查", icon: "🔍", description: "检查内容与前文的一致性", shortcut: "⌘⇧C" },
        { key: "polish", label: "润色优化", icon: "✨", description: "优化文笔和节奏", shortcut: "⌘⇧P" },
      ],
    };
    return actions[activeTab] || actions.dashboard;
  };

  return (
    <ErrorBoundary>
    <div className="workspace">
      {/* 中栏：编辑器 */}
      <div className="workspace-editor">
        <header className="workspace-header" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1.5rem",
          borderBottom: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          boxShadow: "var(--shadow-sm)",
        }}>
          <div className="header-left" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button className="btn-back" onClick={() => navigate("/")} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontSize: "0.875rem",
              transition: "all var(--transition-fast)",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                <path d="m15 18-6-6 6-6" />
              </svg>
              返回书架
            </button>
            <div style={{ width: "1px", height: "24px", background: "var(--border-default)" }} />
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.25rem",
              color: "var(--text-primary)",
              letterSpacing: "0.05em",
              margin: 0,
            }}>《{novel.title}》</h1>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-pipeline" onClick={() => navigate(`/novel/${id}/pipeline`)} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.5rem 1rem",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: "pointer",
              transition: "all var(--transition-fast)",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              流程
            </button>
            <button className="btn-save" onClick={handleSave} style={{
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
              transition: "all var(--transition-fast)",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              保存
            </button>
          </div>
        </header>

        {notice && (
          <div className="notice-bar" style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.75rem 1.5rem",
            background: "rgba(249,115,22,0.08)",
            color: "var(--accent)",
            fontSize: "0.875rem",
            borderBottom: "1px solid var(--border-default)",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {notice}
          </div>
        )}

        <div className="workspace-layout" style={{
          display: "flex",
          flex: 1,
          overflow: "hidden",
        }}>
          <WorkspaceSidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            tabGroups={tabGroups}
          />

          <main className="workspace-content" style={{
            flex: 1,
            overflow: "auto",
            padding: "1.5rem",
          }}>
            <div style={{
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--border-default)",
              boxShadow: "var(--shadow-sm)",
              minHeight: "100%",
              padding: "1.5rem",
            }}>
              {renderContent()}
            </div>
          </main>
        </div>
      </div>

      {/* 右栏：AI 面板 */}
      <AIPanel
        context={activeTab || "工作台"}
        actions={getAIActions()}
        onAction={(key) => console.log("AI action:", key)}
      />
    </div>
    </ErrorBoundary>
  );
};

export default NovelWorkspace;

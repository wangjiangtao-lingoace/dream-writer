import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import CharacterCard from "../components/CharacterCard";
import WorldviewEditor from "../components/WorldviewEditor";
import KnowledgeHub from "../components/KnowledgeHub";
import VolumeEditor from "../components/VolumeEditor";
import MemoryPanel from "../components/MemoryPanel";
import ConsistencyPanel from "../components/ConsistencyPanel";
import StylePanel from "../components/StylePanel";
import { AIPanel } from "../components/layout/AIPanel";
import "../styles/pages/workspace.css";

type WorkspaceTab =
  | "dashboard"
  | "outline"
  | "volumes"
  | "characters"
  | "worldviews"
  | "memory"
  | "consistency"
  | "style"
  | "knowledge"
  | "mainlines"
  | "hooks"
  | "write"
  | "analysis";

interface NovelDetail {
  id: string;
  title: string;
  genre: string | null;
  inspiration: string | null;
  outline: string | null;
  coverImage: string | null;
  status: string;
  chapters: any[];
  characters: any[];
  worldId: string | null;
}

interface TabGroup {
  label: string;
  tabs: {
    key: WorkspaceTab;
    label: string;
    icon: React.ReactNode;
  }[];
}

const NovelWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  const [novel, setNovel] = useState<NovelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    (tab as WorkspaceTab) || "dashboard"
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState("");
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

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
      const data = await api.get<NovelDetail>(`/api/novels/${novelId}`);
      setNovel(data);
    } catch (error) {
      console.error("加载作品失败:", error);
      alert("作品不存在或加载失败");
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
      alert("保存失败，请重试");
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
        return <WorkflowDashboard novelId={id!} />;

      case "outline":
        return (
          <div className="outline-panel">
            <div className="panel-header">
              <h2>作品大纲</h2>
              <button className="btn-edit" onClick={() => {
                if (editingOutline) {
                  // 保存大纲
                  api.put(`/api/novels/${id}`, { outline: outlineDraft })
                    .then(() => {
                      setNovel(prev => prev ? { ...prev, outline: outlineDraft } : null);
                      setEditingOutline(false);
                      setNotice("大纲已保存");
                    })
                    .catch(() => alert("保存失败"));
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
                <h3>创作灵感</h3>
                <p>{novel.inspiration || "暂无灵感描述"}</p>
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
                  <p>{novel.outline || "暂无大纲，请点击编辑按钮添加"}</p>
                )}
              </div>
            </div>
          </div>
        );

      case "volumes":
        return <VolumeEditor novelId={id!} onNotice={handleNotice} />;

      case "characters":
        return <CharacterCard novelId={id!} onNotice={handleNotice} />;

      case "worldviews":
        return <WorldviewEditor novelId={id!} onNotice={handleNotice} />;

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
        return <WritePanel novelId={id!} />;

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
    <div className="workspace">
      {/* 左栏：章节目录 */}
      <aside className="workspace-chapters">
        <div className="workspace-chapters-title">章节目录</div>
        {novel?.chapters?.map((chapter: { id: string; title: string }) => (
          <div
            key={chapter.id}
            className={`workspace-chapter-item ${activeChapterId === chapter.id ? "active" : ""}`}
            onClick={() => setActiveChapterId(chapter.id)}
          >
            <span>{chapter.title}</span>
          </div>
        ))}
      </aside>

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
          <div className="header-left" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button className="btn-back" onClick={() => navigate("/")} style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <h1 style={{
              fontFamily: "var(--font-serif)",
              fontSize: "1.25rem",
              color: "var(--text-primary)",
              letterSpacing: "0.05em",
            }}>《{novel.title}》</h1>
          </div>
          <div className="header-actions" style={{ display: "flex", gap: "0.5rem" }}>
            <button className="btn-pipeline" onClick={() => navigate(`/novel/${id}/pipeline`)} style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.375rem 0.75rem",
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: "pointer",
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
              padding: "0.375rem 0.75rem",
              background: "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: "pointer",
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
          <aside className="workspace-sidebar" style={{
            width: sidebarCollapsed ? "48px" : "200px",
            background: "var(--bg-surface)",
            borderRight: "1px solid var(--border-default)",
            display: "flex",
            flexDirection: "column",
            transition: "width var(--transition-normal)",
            overflow: "hidden",
          }}>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "40px",
                background: "transparent",
                color: "var(--text-muted)",
                border: "none",
                borderBottom: "1px solid var(--border-default)",
                cursor: "pointer",
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
                {sidebarCollapsed ? (
                  <path d="m9 18 6-6-6-6" />
                ) : (
                  <path d="m15 18-6-6 6-6" />
                )}
              </svg>
            </button>
            <nav className="sidebar-nav" style={{
              flex: 1,
              overflowY: "auto",
              padding: "0.5rem",
            }}>
              {tabGroups.map((group) => (
                <div key={group.label} className="tab-group" style={{ marginBottom: "0.75rem" }}>
                  <div className="group-label" style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    padding: "0.5rem 0.5rem 0.25rem",
                    whiteSpace: "nowrap",
                  }}>{group.label}</div>
                  <div className="group-tabs" style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}>
                    {group.tabs.map((t) => (
                      <button
                        key={t.key}
                        className={`sidebar-item ${activeTab === t.key ? "active" : ""}`}
                        onClick={() => handleTabChange(t.key)}
                        title={t.label}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          padding: "0.5rem",
                          background: activeTab === t.key ? "rgba(249,115,22,0.08)" : "transparent",
                          color: activeTab === t.key ? "var(--accent)" : "var(--text-secondary)",
                          border: activeTab === t.key ? "1px solid var(--border-default)" : "1px solid transparent",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          fontSize: "0.8125rem",
                          whiteSpace: "nowrap",
                          transition: "all var(--transition-fast)",
                        }}
                      >
                        <span className="tab-icon" style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "1.25rem",
                          height: "1.25rem",
                          flexShrink: 0,
                        }}>{t.icon}</span>
                        <span className="tab-label">{t.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>

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
  );
};

// 主线面板组件
const MainlinePanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const [mainlines, setMainlines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", description: "" });

  useEffect(() => {
    loadMainlines();
  }, [novelId]);

  const loadMainlines = async () => {
    try {
      setLoading(true);
      const data = await api.get<any[]>(`/api/novels/${novelId}/mainlines`);
      setMainlines(data || []);
    } catch (error) {
      console.error("加载主线失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      alert("请输入主线标题");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/api/novels/${novelId}/mainlines/${editingId}`, formData);
      } else {
        await api.post(`/api/novels/${novelId}/mainlines`, formData);
      }
      setFormData({ title: "", description: "" });
      setShowForm(false);
      setEditingId(null);
      loadMainlines();
    } catch (error) {
      console.error("保存主线失败:", error);
    }
  };

  const handleEdit = (mainline: any) => {
    setEditingId(mainline.id);
    setFormData({ title: mainline.title, description: mainline.description || "" });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这条主线吗？")) return;
    try {
      await api.delete(`/api/novels/${novelId}/mainlines/${id}`);
      loadMainlines();
    } catch (error) {
      console.error("删除主线失败:", error);
    }
  };

  const handleAIGenerate = async () => {
    try {
      setGenerating(true);
      const result = await api.post<{ mainlines: any[] }>("/api/ai/generate-mainlines", { novelId });
      if (result.mainlines && result.mainlines.length > 0) {
        for (const mainline of result.mainlines) {
          await api.post(`/api/novels/${novelId}/mainlines`, mainline);
        }
        await loadMainlines();
        alert(`已生成 ${result.mainlines.length} 条主线`);
      }
    } catch (error) {
      console.error("AI生成主线失败:", error);
      alert("AI生成主线失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="mainline-panel">
      <div className="panel-header">
        <h2>故事主线</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-ai"
            onClick={handleAIGenerate}
            disabled={generating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.375rem 0.75rem",
              background: generating ? "var(--border-default)" : "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: generating ? "not-allowed" : "pointer",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {generating ? "生成中..." : "AI生成主线"}
          </button>
          <button className="btn-add" onClick={() => { setEditingId(null); setFormData({ title: "", description: "" }); setShowForm(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加主线
          </button>
        </div>
      </div>

      {showForm && (
        <div className="inline-form">
          <input
            type="text"
            placeholder="主线标题"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <textarea
            placeholder="主线描述"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreate}>{editingId ? "更新" : "创建"}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</button>
          </div>
        </div>
      )}

      <div className="mainline-list">
        {mainlines.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>暂无主线，点击上方按钮添加或使用AI生成</p>
          </div>
        ) : (
          mainlines.map((mainline) => (
            <div key={mainline.id} className="mainline-item">
              <div className="mainline-content">
                <h3>{mainline.title}</h3>
                <p>{mainline.description || "暂无描述"}</p>
                <span className={`status ${mainline.status}`}>
                  {mainline.status === "active" ? "进行中" : mainline.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  className="btn-edit"
                  onClick={() => handleEdit(mainline)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem" }}>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(mainline.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// 钩子面板组件
const HookPanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const [hooks, setHooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "suspense",
    intensity: 5,
  });

  useEffect(() => {
    loadHooks();
  }, [novelId]);

  const loadHooks = async () => {
    try {
      setLoading(true);
      const data = await api.get<any[]>(`/api/novels/${novelId}/hooks`);
      setHooks(data || []);
    } catch (error) {
      console.error("加载钩子失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) {
      alert("请输入钩子标题");
      return;
    }
    try {
      if (editingId) {
        await api.put(`/api/novels/${novelId}/hooks/${editingId}`, formData);
      } else {
        await api.post(`/api/novels/${novelId}/hooks`, formData);
      }
      setFormData({ title: "", description: "", type: "suspense", intensity: 5 });
      setShowForm(false);
      setEditingId(null);
      loadHooks();
    } catch (error) {
      console.error("保存钩子失败:", error);
    }
  };

  const handleEdit = (hook: any) => {
    setEditingId(hook.id);
    setFormData({
      title: hook.title,
      description: hook.description || "",
      type: hook.type || "suspense",
      intensity: hook.intensity || 5,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定要删除这个钩子吗？")) return;
    try {
      await api.delete(`/api/novels/${novelId}/hooks/${id}`);
      loadHooks();
    } catch (error) {
      console.error("删除钩子失败:", error);
    }
  };

  const handleAIGenerate = async () => {
    try {
      setGenerating(true);
      const result = await api.post<{ hooks: any[] }>("/api/ai/generate-hooks", { novelId });
      if (result.hooks && result.hooks.length > 0) {
        for (const hook of result.hooks) {
          await api.post(`/api/novels/${novelId}/hooks`, hook);
        }
        await loadHooks();
        alert(`已生成 ${result.hooks.length} 个钩子`);
      }
    } catch (error) {
      console.error("AI生成钩子失败:", error);
      alert("AI生成钩子失败，请重试");
    } finally {
      setGenerating(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const typeMap: Record<string, string> = {
      suspense: "悬念",
      foreshadow: "伏笔",
      cliffhanger: "悬念",
      comedy: "喜剧",
    };
    return typeMap[type] || type;
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="hook-panel">
      <div className="panel-header">
        <h2>故事钩子</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            className="btn-ai"
            onClick={handleAIGenerate}
            disabled={generating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.375rem 0.75rem",
              background: generating ? "var(--border-default)" : "var(--accent)",
              color: "var(--text-inverse)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: generating ? "not-allowed" : "pointer",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem" }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            {generating ? "生成中..." : "AI批量预设钩子"}
          </button>
          <button className="btn-add" onClick={() => { setEditingId(null); setFormData({ title: "", description: "", type: "suspense", intensity: 5 }); setShowForm(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            添加钩子
          </button>
        </div>
      </div>

      {showForm && (
        <div className="inline-form">
          <input
            type="text"
            placeholder="钩子标题"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          />
          <textarea
            placeholder="钩子描述"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
          <div className="form-row">
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="suspense">悬念</option>
              <option value="foreshadow">伏笔</option>
              <option value="cliffhanger">悬念</option>
              <option value="comedy">喜剧</option>
            </select>
            <div className="range-group">
              <label>强度</label>
              <input
                type="range"
                min="1"
                max="10"
                value={formData.intensity}
                onChange={(e) => setFormData({ ...formData, intensity: parseInt(e.target.value) })}
              />
              <span>{formData.intensity}</span>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={handleCreate}>{editingId ? "更新" : "创建"}</button>
            <button className="btn-secondary" onClick={() => { setShowForm(false); setEditingId(null); }}>取消</button>
          </div>
        </div>
      )}

      <div className="hook-list">
        {hooks.length === 0 ? (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 22V8" />
              <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
              <circle cx="12" cy="5" r="3" />
            </svg>
            <p>暂无钩子，点击上方按钮添加或使用AI生成</p>
          </div>
        ) : (
          hooks.map((hook) => (
            <div key={hook.id} className="hook-item">
              <div className="hook-content">
                <h3>{hook.title}</h3>
                <p>{hook.description || "暂无描述"}</p>
                <div className="hook-meta">
                  <span className="type">{getTypeLabel(hook.type)}</span>
                  <span className="intensity">强度: {hook.intensity}/10</span>
                  <span className={`status ${hook.status}`}>
                    {hook.status === "planted" ? "已埋设" : hook.status}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.25rem" }}>
                <button
                  className="btn-edit"
                  onClick={() => handleEdit(hook)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "28px",
                    height: "28px",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.75rem", height: "0.75rem" }}>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
                <button
                  className="btn-delete"
                  onClick={() => handleDelete(hook.id)}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

interface WorkflowStatus {
  novel: NovelDetail;
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
  health: { missing: string[]; warnings: string[] };
}

const WorkflowDashboard: React.FC<{ novelId: string }> = ({ novelId }) => {
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

  const cards = [
    { label: "拆书", value: status.bookAnalysis ? `${status.bookAnalysis.sectionCompleted}/${status.bookAnalysis.sectionTotal}` : "未开始", text: status.bookAnalysis ? `${status.bookAnalysis.usedForImitation} 个分区用于仿写` : "需要资料或粘贴内容" },
    { label: "仿写", value: status.imitation ? "已生成" : "缺失", text: status.imitation ? `样章 ${status.imitation.sampleDraftCount} 个，${status.imitation.materialized ? "已落库" : "未落库"}` : "需要先完成拆书" },
    { label: "资产", value: `${status.assets.knowledgeAssets || 0}/${status.assets.memories || 0}`, text: `知识库 / 记忆，人物 ${status.assets.characters || 0}，世界观 ${status.assets.worldviews || 0}` },
    { label: "章节", value: `${status.chapters.drafted}/${status.chapters.total}`, text: `前三章：${status.chapters.firstThree.map((chapter) => chapter.hasContent ? "有" : "缺").join(" / ")}` },
  ];

  return (
    <div className="workflow-dashboard" style={{ display: "grid", gap: "1.25rem" }}>
      <div className="panel-header">
        <h2>创作总控台</h2>
        <p className="panel-desc">主路径：资料 → 拆书 → 仿写蓝图 → 资产落库 → 自动生成 1-3 章 → 继续创作。</p>
      </div>

      {notice && <div className="notice-bar" style={{ padding: "0.75rem 1rem", border: "1px solid var(--border-default)", borderRadius: "var(--radius-sm)", color: "var(--accent)", background: "rgba(249,115,22,0.06)" }}>{notice}</div>}

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
                <span style={{ color: "var(--text-secondary)" }}>{key}</span>
                <strong style={{ color: value.includes("Pipeline") ? "var(--accent)" : "var(--text-primary)" }}>{value}</strong>
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
        <h3 style={{ margin: 0, padding: "0.875rem 1rem", background: "var(--bg-surface)", borderBottom: "1px solid var(--border-default)", fontSize: "1rem" }}>成果与使用记录</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", padding: "1rem" }}>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            {status.chapters.firstThree.map((chapter) => (
              <div key={chapter.order} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", padding: "0.625rem 0", borderBottom: "1px solid var(--border-light)" }}>
                <span>第{chapter.order}章 {chapter.title}</span>
                <strong>{chapter.hasContent ? `${chapter.wordCount}字 · ${chapter.source || "未知来源"}` : "未生成"}</strong>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gap: "0.5rem", maxHeight: "180px", overflow: "auto" }}>
            {status.usage.recent.slice(0, 8).map((item) => (
              <div key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", fontSize: "0.8125rem" }}>
                <span>{item.title}</span>
                <em style={{ fontStyle: "normal", color: "var(--text-muted)" }}>{item.assetType}</em>
              </div>
            ))}
            {status.usage.recent.length === 0 && <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.875rem" }}>还没有 Pipeline 使用记录。</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

// 写作面板组件
const WritePanel: React.FC<{ novelId: string }> = ({ novelId }) => {
  const [chapters, setChapters] = useState<any[]>([]);
  const [activeChapter, setActiveChapter] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadChapters();
  }, [novelId]);

  const loadChapters = async () => {
    try {
      setLoading(true);
      const data = await api.get<{ chapters: any[] }>(`/api/novels/${novelId}`);
      const nextChapters = data?.chapters || [];
      setChapters(nextChapters);
      if (activeChapter?.id) {
        const updatedActive = nextChapters.find((chapter) => chapter.id === activeChapter.id);
        if (updatedActive) setActiveChapter(updatedActive);
      }
    } catch (error) {
      console.error("加载章节失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateChapter = async () => {
    try {
      const newChapter = await api.post<any>(`/api/novels/${novelId}/chapters`, {
        title: `第${chapters.length + 1}章`,
      });
      loadChapters();
      setActiveChapter(newChapter);
    } catch (error) {
      console.error("创建章节失败:", error);
    }
  };

  const handleSaveChapter = async () => {
    if (!activeChapter) return;
    try {
      await api.put(
        `/api/novels/${novelId}/chapters/${activeChapter.id}`,
        activeChapter
      );
      alert("保存成功");
    } catch (error) {
      console.error("保存章节失败:", error);
    }
  };

  const handleGenerate = async () => {
    if (!activeChapter) return;
    try {
      const response = await fetch(
        `/api/novels/${novelId}/chapters/${activeChapter.id}/generate`,
        { method: "POST" }
      );
      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = new TextDecoder().decode(value);
        setActiveChapter((prev: any) => ({
          ...prev,
          content: (prev.content || "") + text,
          wordCount: ((prev.content || "") + text).replace(/\s/g, "").length,
        }));
      }
      const data = await api.get<{ chapters: any[] }>(`/api/novels/${novelId}`);
      const nextChapters = data?.chapters || [];
      setChapters(nextChapters);
      const updatedActive = nextChapters.find((chapter) => chapter.id === activeChapter.id);
      if (updatedActive) setActiveChapter(updatedActive);
    } catch (error) {
      console.error("生成失败:", error);
    }
  };

  if (loading) {
    return <div className="panel-loading">加载中...</div>;
  }

  return (
    <div className="write-panel">
      <div className="chapter-sidebar">
        <div className="chapter-header">
          <h3>章节列表</h3>
          <button className="btn-add" onClick={handleCreateChapter}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
        <div className="chapter-list">
          {chapters.map((chapter) => (
            <div
              key={chapter.id}
              className={`chapter-item ${activeChapter?.id === chapter.id ? "active" : ""}`}
              onClick={() => setActiveChapter(chapter)}
            >
              <span className="chapter-title">
                {chapter.title}
                <em style={{ marginLeft: "0.5rem", fontStyle: "normal", color: "var(--text-muted)", fontSize: "0.75rem" }}>
                  {chapter.wordCount || 0}字
                </em>
              </span>
              <span className="chapter-status">{chapter.status} · {chapter.source || "manual"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="write-content">
        {activeChapter ? (
          <>
            <div className="write-header">
              <input
                type="text"
                value={activeChapter.title}
                onChange={(e) =>
                  setActiveChapter({ ...activeChapter, title: e.target.value })
                }
              />
              <div className="write-actions">
                <span style={{ alignSelf: "center", fontSize: "0.8125rem", color: "var(--text-muted)" }}>
                  {activeChapter.wordCount || 0}字 · 来源：{activeChapter.source || "manual"}
                </span>
                <button className="btn-secondary" onClick={handleSaveChapter}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  保存
                </button>
                <button className="btn-primary" onClick={handleGenerate}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  AI生成
                </button>
              </div>
            </div>
            <textarea
              className="write-editor"
              value={activeChapter.content || ""}
              onChange={(e) =>
                setActiveChapter({ ...activeChapter, content: e.target.value })
              }
              placeholder="开始写作..."
            />
          </>
        ) : (
          <div className="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <p>请选择章节或创建新章节</p>
          </div>
        )}
      </div>
    </div>
  );
};

// 拆书面板组件
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
    setLoading(true);
    setNotice(null);
    try {
      await api.post(`/api/imitation-plans/${activePlan.id}/apply-to-pipeline`, {
        autoContinue: true,
        autoDraftChapters: 3,
        volumeCount: 1,
        chaptersPerVolume: 3,
        targetWordCount: 1800,
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
          background: notice.includes("失败") ? "rgba(220,53,69,0.08)" : "rgba(249,115,22,0.08)",
          color: notice.includes("失败") ? "#dc3545" : "var(--accent)",
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
            background: "rgba(249,115,22,0.05)",
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
                    background: activeAnalysis?.id === analysis.id ? "rgba(249,115,22,0.08)" : "transparent",
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
                  background: "rgba(249,115,22,0.05)",
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
                {activeAnalysis.sections.map((section) => (
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
                ))}
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
                    background: activePlan?.id === plan.id ? "rgba(249,115,22,0.08)" : "transparent",
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
                  <pre style={{ margin: 0, padding: "1rem", maxHeight: "220px", overflow: "auto", whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                    {JSON.stringify(activePlan.blueprint, null, 2)}
                  </pre>
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
    </div>
  );
};

export default NovelWorkspace;

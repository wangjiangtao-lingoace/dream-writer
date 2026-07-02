import React, { useRef, useEffect, useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import AIProgressBanner from './AIProgressBanner';
import WorkspaceTopBar from './WorkspaceTopBar';
import ChapterSidebar from './ChapterSidebar';
import RichTextEditor from './RichTextEditor';
import ChapterHeaderView from './ChapterHeaderView';
import AssetPanel from './AssetPanel';
import WorkspaceBottomBar from './WorkspaceBottomBar';
import PolishDialog from './PolishDialog';
import type { WorkspaceData, RadarScores, AIReview } from './types';

interface WorkspaceWriteLayoutProps {
  // 数据
  novelId: string;
  workspaceData: WorkspaceData | null;
  radarScores: RadarScores | null;
  activeChapterData: any;
  aiReview: AIReview | undefined;
  worldviews: any[];
  aiProgress: { message: string; progress?: number } | null;

  // 状态
  activeChapterId: string | null;
  continuing: boolean;
  showExportMenu: boolean;
  isGeneratingReview?: boolean;

  // 状态
  aiProcessing?: string | null;
  simpleMode?: boolean;

  // 回调函数
  onToggleSimpleMode?: () => void;
  onNavigate: (path: string) => void;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: () => void;
  onContinue: () => void;
  onEditorChange: (content: string) => void;
  onToolbarAction: (action: string) => void;
  onExport: (type: string) => void;
  onShowExportMenu: (show: boolean) => void;
  getBreadcrumb: () => string;
  onGenerateReview?: () => void;
  onPolish?: (mode: "review" | "custom", userHint?: string) => Promise<string>;
}

export const WorkspaceWriteLayout: React.FC<WorkspaceWriteLayoutProps> = ({
  novelId,
  workspaceData,
  radarScores,
  activeChapterData,
  aiReview,
  worldviews,
  aiProgress,
  aiProcessing,
  activeChapterId,
  continuing,
  showExportMenu,
  isGeneratingReview,
  simpleMode,
  onToggleSimpleMode,
  onNavigate,
  onSelectChapter,
  onCreateChapter,
  onContinue,
  onEditorChange,
  onToolbarAction,
  onExport,
  onShowExportMenu,
  getBreadcrumb,
  onGenerateReview,
  onPolish,
}) => {
  // Polish dialog state
  const [showPolishDialog, setShowPolishDialog] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [showPolishPreview, setShowPolishPreview] = useState(false);
  const [polishedContent, setPolishedContent] = useState<string | null>(null);
  const defaultWritingStats = {
    todayWordCount: 0,
    targetWordCount: 3000,
    totalWordCount: 0,
    streakDays: 0,
    estimatedTime: "--",
  };

  const defaultSignals = { mood: "平和", rhythm: "铺垫", climax: false };

  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showExportMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        onShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showExportMenu, onShowExportMenu]);

  const handlePolishConfirm = async (mode: "review" | "custom", userHint?: string) => {
    if (!onPolish) return;
    setIsPolishing(true);
    try {
      const result = await onPolish(mode, userHint);
      setPolishedContent(result);
      setShowPolishDialog(false);
      setShowPolishPreview(true);
    } catch (error) {
      console.error("润色失败:", error);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleApplyPolish = () => {
    if (polishedContent) {
      onEditorChange(polishedContent);
      setShowPolishPreview(false);
      setPolishedContent(null);
    }
  };

  return (
    <ErrorBoundary>
      <div className="workspace-write-layout">
        {aiProgress && (
          <AIProgressBanner
            message={aiProgress.message}
            progress={aiProgress.progress}
            onDetail={() => onNavigate(`/novel/${novelId}/pipeline`)}
          />
        )}
        <WorkspaceTopBar
          novelTitle={workspaceData?.novel?.title || ""}
          onBack={() => onNavigate("/")}
          writingStats={workspaceData?.writingStats || defaultWritingStats}
          signals={workspaceData?.signals || defaultSignals}
          simpleMode={simpleMode}
          onToggleSimpleMode={onToggleSimpleMode}
          exportButton={
            <div ref={exportMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => onShowExportMenu(!showExportMenu)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.375rem 0.75rem", borderRadius: "8px",
                  background: "var(--accent)", color: "#fff",
                  border: "none", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                导出
              </button>
              {showExportMenu && (
                <div style={{
                  position: "absolute", top: "100%", right: 0, marginTop: "4px",
                  background: "#fff", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  border: "1px solid var(--border-default)", zIndex: 100, minWidth: "160px",
                }}>
                  {[
                    { type: "full", label: "全书正文 TXT" },
                    { type: "outline", label: "大纲设定 TXT" },
                    { type: "characters", label: "人物设定 TXT" },
                    { type: "worldview", label: "世界观设定 TXT" },
                    { type: "volumes", label: "卷纲导出 TXT" },
                    { type: "chapter-outlines", label: "章纲导出 TXT" },
                  ].map((item) => (
                    <div
                      key={item.type}
                      onClick={() => onExport(item.type)}
                      style={{
                        padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8125rem",
                        color: "var(--text-primary)", borderBottom: "1px solid var(--border-default)",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-elevated)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      {item.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          }
        />

        {simpleMode && (
          <div style={{
            padding: "0.5rem 1rem",
            background: "var(--accent-muted, rgba(99,102,241,0.08))",
            color: "var(--accent)",
            fontSize: "0.8125rem",
            borderBottom: "1px solid var(--border-default)",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            新手模式已开启，隐藏了高级功能。可在顶部切换关闭。
          </div>
        )}

        <div className="workspace-write-body">
          <ChapterSidebar
            chapters={workspaceData?.chapters || []}
            activeChapterId={activeChapterId}
            onSelectChapter={onSelectChapter}
            onCreateChapter={onCreateChapter}
            onContinue={onContinue}
            continuing={continuing}
          />

          <main className="workspace-write-main">
            <div className="workspace-write-main-inner">
              {activeChapterData ? (
                <>
                  <ChapterHeaderView
                    breadcrumb={getBreadcrumb()}
                    title={activeChapterData.title}
                    goals={activeChapterData.summary}
                    mood={workspaceData?.storyState?.currentEmotion}
                    wordCount={activeChapterData.wordCount || 0}
                  />
                  {/* 工具栏 */}
                  <div style={{
                    display: "flex", gap: "0.5rem", marginBottom: "0.75rem",
                    padding: "0.5rem", borderRadius: "12px",
                    background: "var(--bg-surface)", border: "1px solid var(--border-default)",
                  }}>
                    {onPolish && (
                      <button
                        onClick={() => setShowPolishDialog(true)}
                        disabled={isPolishing}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: "0.375rem",
                          padding: "0.375rem 0.75rem", borderRadius: "8px",
                          background: "var(--accent-muted)", color: "var(--accent)",
                          border: "none", cursor: isPolishing ? "not-allowed" : "pointer",
                          fontSize: "0.75rem", fontWeight: 600,
                          opacity: isPolishing ? 0.6 : 1,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        {isPolishing ? "润色中..." : "润色优化"}
                      </button>
                    )}
                  </div>
                  <RichTextEditor
                    key={activeChapterId}
                    content={activeChapterData.content || ""}
                    onChange={onEditorChange}
                    placeholder="开始写作..."
                    onToolbarAction={onToolbarAction}
                    aiProcessing={aiProcessing}
                  />
                </>
              ) : (
                <div className="workspace-write-empty">
                  选择一个章节开始写作
                </div>
              )}
            </div>
          </main>

          <AssetPanel
            characters={workspaceData?.characters || []}
            worldviews={workspaceData?.worldviews || worldviews}
            foreshadows={workspaceData?.foreshadows || []}
            aiReview={aiReview}
            activeChapterId={activeChapterId}
            onRevisionRollback={() => {
              if (activeChapterId) {
                onSelectChapter(activeChapterId);
              }
            }}
            onGenerateReview={onGenerateReview}
            isGeneratingReview={isGeneratingReview}
          />
        </div>

        <WorkspaceBottomBar
          analysis={workspaceData?.storyState ? `${workspaceData.storyState.currentPhase}阶段，情绪${workspaceData.storyState.currentEmotion}` : undefined}
          radarScores={radarScores || { pleasureDensity: 50, emotionWave: 50, infoRelease: 30 }}
          nextSuggestion="继续创作下一章"
        />

        {/* 润色对话框 */}
        <PolishDialog
          visible={showPolishDialog}
          chapterTitle={activeChapterData?.title || ""}
          hasReview={!!aiReview}
          onClose={() => setShowPolishDialog(false)}
          onConfirm={handlePolishConfirm}
          loading={isPolishing}
        />

        {/* 润色预览 */}
        {showPolishPreview && polishedContent && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(0,0,0,0.5)",
              backdropFilter: "blur(4px)",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setShowPolishPreview(false);
                setPolishedContent(null);
              }
            }}
          >
            <div
              style={{
                background: "var(--bg-surface)",
                borderRadius: "20px",
                padding: "2rem",
                width: "90vw",
                maxWidth: "1200px",
                maxHeight: "85vh",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 24px 48px rgba(0,0,0,0.15)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  润色结果预览
                </h3>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    onClick={() => {
                      setShowPolishPreview(false);
                      setPolishedContent(null);
                    }}
                    style={{
                      padding: "0.5rem 1rem",
                      borderRadius: "8px",
                      border: "1px solid var(--border-default)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                    }}
                  >
                    放弃
                  </button>
                  <button
                    onClick={handleApplyPolish}
                    style={{
                      padding: "0.5rem 1.25rem",
                      borderRadius: "8px",
                      border: "none",
                      background: "var(--accent)",
                      color: "white",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    应用润色
                  </button>
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "1.25rem",
                  borderRadius: "14px",
                  background: "var(--bg-base)",
                  border: "1px solid var(--border-default)",
                  fontSize: "0.9375rem",
                  lineHeight: 1.8,
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {polishedContent}
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

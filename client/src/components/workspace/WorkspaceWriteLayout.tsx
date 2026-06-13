import React from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import AIProgressBanner from './AIProgressBanner';
import WorkspaceTopBar from './WorkspaceTopBar';
import ChapterSidebar from './ChapterSidebar';
import RichTextEditor from './RichTextEditor';
import ChapterHeaderView from './ChapterHeaderView';
import AssetPanel from './AssetPanel';
import WorkspaceBottomBar from './WorkspaceBottomBar';
import type { WorkspaceData, RadarScores, AIReview } from './types';

interface WorkspaceWriteLayoutProps {
  // 数据
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

  // 回调函数
  onNavigate: (path: string) => void;
  onSelectChapter: (chapterId: string) => void;
  onCreateChapter: () => void;
  onContinue: () => void;
  onEditorChange: (content: string) => void;
  onToolbarAction: (action: string) => void;
  onExport: (type: string) => void;
  onShowExportMenu: (show: boolean) => void;
  getBreadcrumb: () => string;
}

export const WorkspaceWriteLayout: React.FC<WorkspaceWriteLayoutProps> = ({
  workspaceData,
  radarScores,
  activeChapterData,
  aiReview,
  worldviews,
  aiProgress,
  activeChapterId,
  continuing,
  showExportMenu,
  onNavigate,
  onSelectChapter,
  onCreateChapter,
  onContinue,
  onEditorChange,
  onToolbarAction,
  onExport,
  onShowExportMenu,
  getBreadcrumb,
}) => {
  const defaultWritingStats = {
    todayWordCount: 0,
    targetWordCount: 3000,
    totalWordCount: 0,
    streakDays: 0,
    estimatedTime: "--",
  };

  const defaultSignals = { mood: "neutral", rhythm: "development", climax: false };

  return (
    <ErrorBoundary>
      <div className="workspace-write-layout">
        {aiProgress && (
          <AIProgressBanner
            message={aiProgress.message}
            progress={aiProgress.progress}
            onDetail={() => onNavigate(`/novel/pipeline`)}
          />
        )}
        <WorkspaceTopBar
          novelTitle={workspaceData?.novel?.title || ""}
          onBack={() => onNavigate("/")}
          writingStats={workspaceData?.writingStats || defaultWritingStats}
          signals={workspaceData?.signals || defaultSignals}
          exportButton={
            <div style={{ position: "relative" }}>
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
                  <RichTextEditor
                    key={activeChapterId}
                    content={activeChapterData.content || ""}
                    onChange={onEditorChange}
                    placeholder="开始写作..."
                    onToolbarAction={onToolbarAction}
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
            worldviews={worldviews}
            foreshadows={workspaceData?.foreshadows || []}
            aiReview={aiReview}
            activeChapterId={activeChapterId}
            onRevisionRollback={() => {
              if (activeChapterId) {
                onSelectChapter(activeChapterId);
              }
            }}
          />
        </div>

        <WorkspaceBottomBar
          analysis={workspaceData?.storyState ? `${workspaceData.storyState.currentPhase}阶段，情绪${workspaceData.storyState.currentEmotion}` : undefined}
          radarScores={radarScores || { pleasureDensity: 50, emotionWave: 50, infoRelease: 30 }}
          nextSuggestion="继续创作下一章"
        />
      </div>
    </ErrorBoundary>
  );
};

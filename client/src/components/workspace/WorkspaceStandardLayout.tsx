import React from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { AIPanel } from '../layout/AIPanel';
import { WorkspaceHeader } from './WorkspaceHeader';
import WorkspaceSidebar from './WorkspaceSidebar';
import AIProgressBanner from './AIProgressBanner';
import type { WorkspaceTab, WorkspaceGroupId, WorkspaceGroupDef } from './types';

interface WorkspaceStandardLayoutProps {
  // 数据
  novel: { id: string; title: string } | null;
  aiProgress: { message: string; progress?: number } | null;
  notice: string | null;
  activeTab: WorkspaceTab;
  activeGroupId: WorkspaceGroupId;
  groupDefs: WorkspaceGroupDef[];
  sidebarCollapsed: boolean;

  // 回调函数
  onNavigate: (path: string) => void;
  onSave: () => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onGroupClick: (groupId: WorkspaceGroupId) => void;
  onToggleCollapse: () => void;
  getAIActions: () => Array<{ key: string; label: string; icon: string; description: string; shortcut?: string; primary?: boolean }>;

  // 渲染函数
  renderContent: () => React.ReactNode;
}

export const WorkspaceStandardLayout: React.FC<WorkspaceStandardLayoutProps> = ({
  novel,
  aiProgress,
  notice,
  activeTab,
  activeGroupId,
  groupDefs,
  sidebarCollapsed,
  onNavigate,
  onSave,
  onTabChange,
  onGroupClick,
  onToggleCollapse,
  getAIActions,
  renderContent,
}) => {
  return (
    <ErrorBoundary>
      <div className="workspace">
        {/* 中栏：编辑器 */}
        <div className="workspace-editor">
          {aiProgress && (
            <AIProgressBanner
              message={aiProgress.message}
              progress={aiProgress.progress}
              onDetail={() => onNavigate(`/novel/${novel?.id}/pipeline`)}
            />
          )}
          <WorkspaceHeader
            novelTitle={novel?.title || ""}
            onBack={() => onNavigate("/")}
            onSave={onSave}
            onPipeline={() => onNavigate(`/novel/${novel?.id}/pipeline`)}
          />

          {notice && (
            <div className="notice-bar" style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              background: notice.includes("失败") || notice.includes("错误") ? "var(--error-muted)" : "var(--accent-muted)",
              color: notice.includes("失败") || notice.includes("错误") ? "var(--error)" : "var(--accent)",
              fontSize: "0.875rem",
              fontWeight: 500,
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
              onTabChange={onTabChange}
              groups={groupDefs}
              activeGroupId={activeGroupId}
              onGroupClick={onGroupClick}
              collapsed={sidebarCollapsed}
              onToggleCollapse={onToggleCollapse}
            />

            <main className="workspace-content" style={{
              flex: 1,
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
            }}>
              {/* 子 tab 栏：当分组有多个 tab 时显示 */}
              {groupDefs.find(g => g.id === activeGroupId)?.tabs.length! > 1 && (
                <div className="workspace-group-tabs">
                  {groupDefs.find(g => g.id === activeGroupId)?.tabs.map(t => (
                    <button
                      key={t.key}
                      className={`group-tab ${activeTab === t.key ? "active" : ""}`}
                      onClick={() => onTabChange(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="workspace-content-inner">
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
              </div>
            </main>
          </div>
        </div>

        {/* 右栏：AI 面板 */}
        <AIPanel
          context={activeTab || "工作台"}
          actions={getAIActions()}
          onAction={(key: string) => console.log("AI action:", key)}
        />
      </div>
    </ErrorBoundary>
  );
};

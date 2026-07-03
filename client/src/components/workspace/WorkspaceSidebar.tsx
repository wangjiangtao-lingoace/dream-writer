import React from "react";
import type { WorkspaceTab, WorkspaceGroupId, WorkspaceGroupDef } from "./types";

interface WorkspaceSidebarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  groups: WorkspaceGroupDef[];
  activeGroupId: WorkspaceGroupId;
  onGroupClick: (groupId: WorkspaceGroupId) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({
  activeTab,
  onTabChange,
  groups,
  activeGroupId,
  onGroupClick,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <aside className="workspace-sidebar" style={{
      width: collapsed ? "52px" : "200px",
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border-default)",
      display: "flex",
      flexDirection: "column",
      transition: "width var(--transition-normal)",
      overflow: "hidden",
      flexShrink: 0,
    }}>
      <button
        className="sidebar-toggle"
        onClick={onToggleCollapse}
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
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ width: "1rem", height: "1rem" }}>
          {collapsed ? (
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
        {groups.map((group) => {
          const isActiveGroup = activeGroupId === group.id;
          return (
            <div key={group.id} className="sidebar-group" style={{ marginBottom: "0.25rem" }}>
              <button
                className="sidebar-group-header"
                onClick={() => onGroupClick(group.id)}
                title={group.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  width: "100%",
                  padding: collapsed ? "0.625rem" : "0.5rem 0.625rem",
                  background: isActiveGroup ? "var(--accent-muted)" : "transparent",
                  color: isActiveGroup ? "var(--accent)" : "var(--text-secondary)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: isActiveGroup ? 600 : 500,
                  transition: "all var(--transition-fast)",
                  justifyContent: collapsed ? "center" : "flex-start",
                }}
              >
                <span style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "1.25rem",
                  height: "1.25rem",
                  flexShrink: 0,
                }}>{group.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ flex: 1, textAlign: "left", whiteSpace: "nowrap" }}>{group.label}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      style={{
                        width: "0.75rem",
                        height: "0.75rem",
                        opacity: 0.5,
                        transition: "transform var(--transition-fast)",
                        transform: isActiveGroup ? "rotate(90deg)" : "rotate(0deg)",
                      }}
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </>
                )}
              </button>

              {!collapsed && isActiveGroup && (
                <div className="sidebar-group-tabs" style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "1px",
                  paddingTop: "0.25rem",
                  paddingBottom: "0.25rem",
                  paddingLeft: "0.75rem",
                }}>
                  {group.tabs.map((t) => (
                    <button
                      key={t.key}
                      className={`sidebar-subtab ${activeTab === t.key ? "active" : ""}`}
                      onClick={() => onTabChange(t.key)}
                      title={t.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.375rem 0.5rem",
                        background: activeTab === t.key ? "var(--accent)" : "transparent",
                        color: activeTab === t.key ? "var(--text-inverse)" : "var(--text-secondary)",
                        border: "none",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        whiteSpace: "nowrap",
                        transition: "all var(--transition-fast)",
                        fontWeight: activeTab === t.key ? 500 : 400,
                      }}
                    >
                      <span style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "1rem",
                        height: "1rem",
                        flexShrink: 0,
                      }}>{t.icon}</span>
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default WorkspaceSidebar;

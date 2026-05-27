import React, { useState } from "react";
import type { WorkspaceTab, TabGroup } from "./types";

interface WorkspaceSidebarProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  tabGroups: TabGroup[];
}

const WorkspaceSidebar: React.FC<WorkspaceSidebarProps> = ({ activeTab, onTabChange, tabGroups }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="workspace-sidebar" style={{
      width: collapsed ? "48px" : "200px",
      background: "var(--bg-surface)",
      borderRight: "1px solid var(--border-default)",
      display: "flex",
      flexDirection: "column",
      transition: "width var(--transition-normal)",
      overflow: "hidden",
    }}>
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(!collapsed)}
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
                  onClick={() => onTabChange(t.key)}
                  title={t.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.5rem",
                    background: activeTab === t.key ? "var(--accent-muted)" : "transparent",
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
  );
};

export default WorkspaceSidebar;

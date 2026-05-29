import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface SidebarProps {
  collapsed?: boolean;
}

interface NavItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "项目",
    items: [
      {
        key: "bookshelf",
        label: "书架",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
        path: "/",
      },
      {
        key: "create",
        label: "创建新作品",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
        path: "/create",
      },
    ],
  },
  {
    title: "工具",
    items: [
      {
        key: "guide",
        label: "功能引导",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
        path: "/guide",
      },
      {
        key: "knowledge",
        label: "通用知识库",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
        path: "/knowledge",
      },
    ],
  },
  {
    title: "设置",
    items: [
      {
        key: "settings",
        label: "AI 模型配置",
        icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
        path: "/settings",
      },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ collapsed = false }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <nav
      style={{
        width: collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)",
        height: "100%",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border-subtle)",
        padding: "var(--space-3) var(--space-2)",
        overflow: "hidden",
        transition: "width var(--transition-normal)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {navGroups.map((group) => (
        <div key={group.title} style={{ marginBottom: "var(--space-3)" }}>
          {!collapsed && (
            <div
              style={{
                fontSize: "var(--text-xs)",
                color: "var(--text-disabled)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "var(--space-1) var(--space-2)",
                marginBottom: "var(--space-1)",
              }}
            >
              {group.title}
            </div>
          )}
          {group.items.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              aria-current={isActive(item.path) ? "page" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                width: "100%",
                padding: collapsed ? "var(--space-2)" : "var(--space-2) var(--space-2)",
                background: isActive(item.path) ? "var(--accent-muted)" : "transparent",
                border: "none",
                borderRadius: "var(--radius-md)",
                color: isActive(item.path) ? "var(--accent)" : "var(--text-secondary)",
                fontSize: "var(--text-sm)",
                cursor: "pointer",
                transition: "all var(--transition-fast)",
                justifyContent: collapsed ? "center" : "flex-start",
              }}
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
};

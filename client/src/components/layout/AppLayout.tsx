import React, { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export const AppLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();

  // 检测是否为工作台页面（/novel/:id 开头）
  const isCreatePage = location.pathname.startsWith("/create");
  const isWorkspace = location.pathname.startsWith("/novel/");

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      {/* 工作台页面隐藏全局侧边栏 */}
      {!isWorkspace && <Sidebar collapsed={sidebarCollapsed} />}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* 工作台和创建页面隐藏顶部栏 */}
        {!isWorkspace && !isCreatePage && (
          <TopBar
            actions={
              <button
                aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "var(--space-1)",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            }
          />
        )}
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AppLayout;

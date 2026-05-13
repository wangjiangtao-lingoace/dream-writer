# Dream Writer UI 全面重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Dream Writer 从古风主题改造为深色科技风（炭黑琥珀），实现三栏布局 + AI 上下文操作面板。

**Architecture:** CSS 变量驱动 design token，组件样式外提。三栏布局（侧边栏 + 主内容 + AI 面板）通过 CSS Grid 实现。AI 面板根据当前上下文动态显示可用操作。

**Tech Stack:** React 19, TypeScript, Vite 7, CSS Variables, TanStack Query

**Design Spec:** `docs/superpowers/specs/2026-05-14-ui-redesign-design.md`

---

## 文件结构总览

### 新建文件
```
client/src/styles/tokens.css              ← Design Token（替换现有）
client/src/styles/base.css                ← 全局基础样式（替换现有）
client/src/styles/components.css          ← 通用组件样式（替换现有）
client/src/styles/pages/bookshelf.css     ← 书架页样式
client/src/styles/pages/workspace.css     ← 工作台样式
client/src/styles/pages/pipeline.css      ← Pipeline 样式
client/src/styles/pages/create.css        ← 创建页样式
client/src/styles/pages/settings.css      ← 设置页样式
client/src/components/layout/AppLayout.tsx ← 三栏布局容器
client/src/components/layout/Sidebar.tsx   ← 侧边栏
client/src/components/layout/AIPanel.tsx   ← AI 面板
client/src/components/layout/TopBar.tsx    ← 顶部栏
client/src/components/ui/Button.tsx        ← 按钮组件
client/src/components/ui/Card.tsx          ← 卡片组件
client/src/components/ui/Input.tsx         ← 输入框组件
client/src/components/ui/Modal.tsx         ← 弹窗组件
client/src/components/ui/Skeleton.tsx      ← 骨架屏组件
client/src/components/ui/Tabs.tsx          ← Tab 组件
client/src/contexts/AIContext.tsx           ← AI 面板状态
client/src/hooks/useAI.ts                  ← AI 操作 hook
client/src/hooks/useConfig.ts              ← AI 配置 hook
client/src/pages/Settings.tsx              ← 设置页
```

### 修改文件
```
client/src/main.tsx                        ← 引入新样式
client/src/router/index.tsx                ← 更新路由
client/src/pages/BookShelf.tsx             ← 重构为列表视图
client/src/pages/NovelWorkspace.tsx        ← 重构为三栏布局
client/src/pages/PipelinePage.tsx          ← 重构为阶段流
client/src/pages/CreateWork.tsx            ← 重构
client/src/pages/NovelForm.tsx             ← 适配新主题
client/src/lib/api.ts                      ← 添加 aiConfig API
```

### 删除文件
```
client/src/styles/ancient-theme.css        ← 古风主题（已删）
client/src/styles/workbench.css            ← 旧样式（已删）
client/src/styles/workspace-ancient.css    ← 旧样式（已删）
```

---

## Task 1: Design Token 系统

**Files:**
- Overwrite: `client/src/styles/tokens.css`
- Overwrite: `client/src/styles/base.css`
- Overwrite: `client/src/styles/components.css`

- [ ] **Step 1: 重写 tokens.css**

```css
/* client/src/styles/tokens.css */
:root {
  /* 背景 */
  --bg-base: #08080a;
  --bg-surface: #0c0c0e;
  --bg-elevated: #0f0f12;
  --bg-overlay: #111114;

  /* 边框 */
  --border-subtle: #1a1a20;
  --border-default: #222228;
  --border-strong: #2a2a34;

  /* 文字 */
  --text-primary: #e4e4e7;
  --text-secondary: #9a9aa0;
  --text-muted: #6b6b76;
  --text-disabled: #3a3a42;

  /* 主色：琥珀橙 */
  --accent: #f97316;
  --accent-hover: #fb923c;
  --accent-muted: rgba(249, 115, 22, 0.15);
  --accent-glow: rgba(249, 115, 22, 0.4);

  /* 语义色 */
  --success: #22c55e;
  --success-muted: rgba(34, 197, 94, 0.15);
  --warning: #eab308;
  --warning-muted: rgba(234, 179, 8, 0.15);
  --error: #ef4444;
  --error-muted: rgba(239, 68, 68, 0.15);
  --info: #3b82f6;
  --info-muted: rgba(59, 130, 246, 0.15);

  /* 间距（4px 网格） */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 8px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 16px var(--accent-glow);

  /* 字体 */
  --font-sans: "Noto Sans SC", "PingFang SC", -apple-system, sans-serif;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;

  /* 字号 */
  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.125rem;   /* 18px */
  --text-xl: 1.25rem;    /* 20px */
  --text-2xl: 1.5rem;    /* 24px */

  /* 过渡 */
  --transition-fast: 120ms ease;
  --transition-normal: 200ms ease;
  --transition-slow: 300ms ease;

  /* 布局 */
  --sidebar-width: 200px;
  --sidebar-collapsed-width: 52px;
  --ai-panel-width: 280px;
  --topbar-height: 48px;
}
```

- [ ] **Step 2: 重写 base.css**

```css
/* client/src/styles/base.css */
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-base);
  min-height: 100vh;
  overflow-x: hidden;
}

a {
  color: var(--accent);
  text-decoration: none;
  transition: color var(--transition-fast);
}

a:hover {
  color: var(--accent-hover);
}

::selection {
  background: var(--accent-muted);
  color: var(--text-primary);
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--border-strong);
}

input, textarea, select, button {
  font-family: inherit;
  font-size: inherit;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideIn {
  from { opacity: 0; transform: translateX(8px); }
  to { opacity: 1; transform: translateX(0); }
}
```

- [ ] **Step 3: 重写 components.css**

```css
/* client/src/styles/components.css */

/* 通用按钮 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  line-height: 1.4;
}

.btn-primary {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: white;
  border-color: transparent;
  box-shadow: var(--shadow-sm);
}

.btn-primary:hover {
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

.btn-secondary {
  background: var(--bg-elevated);
  color: var(--text-primary);
  border-color: var(--border-default);
}

.btn-secondary:hover {
  border-color: var(--border-strong);
  background: var(--bg-overlay);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}

.btn-ghost:hover {
  color: var(--text-primary);
  background: var(--accent-muted);
}

.btn-sm {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
}

.btn-lg {
  padding: var(--space-3) var(--space-6);
  font-size: var(--text-base);
}

/* 通用输入框 */
.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-size: var(--text-sm);
  outline: none;
  transition: border-color var(--transition-fast);
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}

.input::placeholder {
  color: var(--text-disabled);
}

/* 通用卡片 */
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  transition: border-color var(--transition-fast);
}

.card:hover {
  border-color: var(--border-strong);
}

/* 标签 */
.badge {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 500;
}

.badge-success {
  background: var(--success-muted);
  color: var(--success);
}

.badge-warning {
  background: var(--warning-muted);
  color: var(--warning);
}

.badge-error {
  background: var(--error-muted);
  color: var(--error);
}

.badge-info {
  background: var(--info-muted);
  color: var(--info);
}

/* 骨架屏 */
.skeleton {
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  animation: pulse 2s infinite;
}

/* 分割线 */
.divider {
  height: 1px;
  background: var(--border-subtle);
  margin: var(--space-3) 0;
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) var(--space-6);
  color: var(--text-muted);
  text-align: center;
}
```

- [ ] **Step 4: 运行类型检查确认无语法错误**

```bash
cd /Users/lingoace/IdeaProjects/dream-writer && pnpm typecheck:client
```

Expected: PASS（CSS 文件不影响类型检查，但确认构建不报错）

- [ ] **Step 5: 提交**

```bash
git add client/src/styles/tokens.css client/src/styles/base.css client/src/styles/components.css
git commit -m "feat: implement dark tech design token system"
```

---

## Task 2: UI 组件库

**Files:**
- Create: `client/src/components/ui/Button.tsx`
- Create: `client/src/components/ui/Card.tsx`
- Create: `client/src/components/ui/Input.tsx`
- Create: `client/src/components/ui/Modal.tsx`
- Create: `client/src/components/ui/Skeleton.tsx`
- Create: `client/src/components/ui/Tabs.tsx`

- [ ] **Step 1: 创建 Button 组件**

```tsx
// client/src/components/ui/Button.tsx
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "secondary",
  size = "md",
  loading = false,
  children,
  disabled,
  className = "",
  ...props
}) => {
  const classes = [
    "btn",
    `btn-${variant === "danger" ? "secondary" : variant}`,
    size !== "md" && `btn-${size}`,
    loading && "btn-loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading && (
        <span
          className="btn-spinner"
          style={{
            width: "1em",
            height: "1em",
            border: "2px solid rgba(255,255,255,0.3)",
            borderTopColor: "white",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
          }}
        />
      )}
      {children}
    </button>
  );
};
```

- [ ] **Step 2: 创建 Card 组件**

```tsx
// client/src/components/ui/Card.tsx
import React from "react";

interface CardProps {
  children: React.ReactNode;
  hoverable?: boolean;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  className = "",
  onClick,
}) => {
  const classes = [
    "card",
    hoverable && "card-hoverable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
      {children}
    </div>
  );
};
```

- [ ] **Step 3: 创建 Input 组件**

```tsx
// client/src/components/ui/Input.tsx
import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        {label && (
          <label
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`input ${error ? "input-error" : ""} ${className}`}
          {...props}
        />
        {error && (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--error)" }}>
            {error}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
```

- [ ] **Step 4: 创建 Modal 组件**

```tsx
// client/src/components/ui/Modal.tsx
import React, { useEffect } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export const Modal: React.FC<ModalProps> = ({
  open,
  onClose,
  title,
  children,
  width = "440px",
}) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (open) {
      document.addEventListener("keydown", handleEsc);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEsc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          backdropFilter: "blur(4px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width,
          maxHeight: "85vh",
          overflow: "auto",
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-xl)",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-lg)",
          animation: "fadeIn var(--transition-normal) ease",
        }}
      >
        {title && (
          <h2
            style={{
              fontSize: "var(--text-lg)",
              fontWeight: 600,
              color: "var(--text-primary)",
              marginBottom: "var(--space-4)",
            }}
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: 创建 Skeleton 组件**

```tsx
// client/src/components/ui/Skeleton.tsx
import React from "react";

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  count?: number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "12px",
  borderRadius = "var(--radius-sm)",
  count = 1,
}) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton"
          style={{ width, height, borderRadius, marginBottom: i < count - 1 ? "var(--space-2)" : 0 }}
        />
      ))}
    </>
  );
};
```

- [ ] **Step 6: 创建 Tabs 组件**

```tsx
// client/src/components/ui/Tabs.tsx
import React from "react";

interface Tab {
  key: string;
  label: string;
  icon?: React.ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeKey: string;
  onChange: (key: string) => void;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, activeKey, onChange }) => {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-1)",
        borderBottom: "1px solid var(--border-subtle)",
        padding: "0 var(--space-4)",
      }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            padding: "var(--space-2) var(--space-3)",
            background: "transparent",
            border: "none",
            borderBottom: `2px solid ${tab.key === activeKey ? "var(--accent)" : "transparent"}`,
            color: tab.key === activeKey ? "var(--accent)" : "var(--text-muted)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all var(--transition-fast)",
            marginBottom: "-1px",
          }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 7: 导出所有组件**

```tsx
// client/src/components/ui/index.ts
export { Button } from "./Button";
export { Card } from "./Card";
export { Input } from "./Input";
export { Modal } from "./Modal";
export { Skeleton } from "./Skeleton";
export { Tabs } from "./Tabs";
```

- [ ] **Step 8: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 9: 提交**

```bash
git add client/src/components/ui/
git commit -m "feat: add UI component library (Button, Card, Input, Modal, Skeleton, Tabs)"
```

---

## Task 3: 布局组件

**Files:**
- Create: `client/src/components/layout/AppLayout.tsx`
- Create: `client/src/components/layout/Sidebar.tsx`
- Create: `client/src/components/layout/TopBar.tsx`
- Create: `client/src/components/layout/AIPanel.tsx`

- [ ] **Step 1: 创建 Sidebar 组件**

```tsx
// client/src/components/layout/Sidebar.tsx
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
```

- [ ] **Step 2: 创建 TopBar 组件**

```tsx
// client/src/components/layout/TopBar.tsx
import React from "react";

interface TopBarProps {
  title?: string;
  breadcrumbs?: Array<{ label: string; path?: string }>;
  actions?: React.ReactNode;
}

export const TopBar: React.FC<TopBarProps> = ({ title, breadcrumbs, actions }) => {
  return (
    <header
      style={{
        height: "var(--topbar-height)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--space-4)",
        background: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <span style={{ color: "var(--text-disabled)", fontSize: "var(--text-xs)" }}>/</span>
                )}
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: crumb.path ? "var(--text-secondary)" : "var(--text-primary)",
                    cursor: crumb.path ? "pointer" : "default",
                  }}
                >
                  {crumb.label}
                </span>
              </React.Fragment>
            ))}
          </div>
        )}
        {title && !breadcrumbs && (
          <h1 style={{ fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--text-primary)" }}>
            {title}
          </h1>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: "var(--space-2)" }}>{actions}</div>}
    </header>
  );
};
```

- [ ] **Step 3: 创建 AIPanel 组件**

```tsx
// client/src/components/layout/AIPanel.tsx
import React from "react";

interface AIAction {
  key: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  description: string;
  primary?: boolean;
}

interface AIPanelProps {
  context: string;
  actions: AIAction[];
  onAction: (key: string) => void;
  result?: React.ReactNode;
  loading?: boolean;
  collapsed?: boolean;
}

export const AIPanel: React.FC<AIPanelProps> = ({
  context,
  actions,
  onAction,
  result,
  loading = false,
  collapsed = false,
}) => {
  if (collapsed) return null;

  return (
    <aside
      style={{
        width: "var(--ai-panel-width)",
        height: "100%",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          borderBottom: "1px solid var(--border-subtle)",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--success)",
          }}
        />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)" }}>
          AI 助手
        </span>
        <span style={{ marginLeft: "auto", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {context}
        </span>
      </div>

      {/* Actions */}
      <div style={{ padding: "var(--space-3)", flex: 1, overflow: "auto" }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
          可用操作
        </div>
        {actions.map((action) => (
          <button
            key={action.key}
            onClick={() => onAction(action.key)}
            disabled={loading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              width: "100%",
              padding: "var(--space-3)",
              background: action.primary ? "var(--accent-muted)" : "var(--bg-elevated)",
              border: `1px solid ${action.primary ? "rgba(249,115,22,0.2)" : "var(--border-subtle)"}`,
              borderRadius: "var(--radius-lg)",
              color: action.primary ? "var(--accent-hover)" : "var(--text-primary)",
              fontSize: "var(--text-sm)",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all var(--transition-fast)",
              marginBottom: "var(--space-2)",
              textAlign: "left",
            }}
          >
            <span style={{ fontSize: "16px", flexShrink: 0 }}>{action.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{action.label}</div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: 2 }}>
                {action.description}
              </div>
            </div>
            {action.shortcut && (
              <span
                style={{
                  fontSize: "var(--text-xs)",
                  color: "var(--text-disabled)",
                  background: "var(--bg-overlay)",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {action.shortcut}
              </span>
            )}
          </button>
        ))}

        {/* Result area */}
        {result && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-disabled)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
              结果
            </div>
            {result}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "var(--space-4)", color: "var(--text-muted)" }}>
            <div style={{ width: 20, height: 20, border: "2px solid var(--border-default)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto var(--space-2)" }} />
            <span style={{ fontSize: "var(--text-xs)" }}>AI 处理中...</span>
          </div>
        )}
      </div>
    </aside>
  );
};
```

- [ ] **Step 4: 创建 AppLayout 组件**

```tsx
// client/src/components/layout/AppLayout.tsx
import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export const AppLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <Sidebar collapsed={sidebarCollapsed} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <TopBar
          actions={
            <button
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
        <main style={{ flex: 1, overflow: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: 导出布局组件**

```tsx
// client/src/components/layout/index.ts
export { AppLayout } from "./AppLayout";
export { Sidebar } from "./Sidebar";
export { TopBar } from "./TopBar";
export { AIPanel } from "./AIPanel";
```

- [ ] **Step 6: 确认路由已使用 AppLayout**

路由文件 `client/src/router/index.tsx` 已经使用 `AppLayout` 作为根布局（`element: <AppLayout />`），无需修改。确认即可。

```bash
grep "AppLayout" client/src/router/index.tsx
```

Expected: 输出包含 `import AppLayout` 和 `element: <AppLayout />`

- [ ] **Step 7: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add client/src/components/layout/ client/src/router/
git commit -m "feat: add three-column layout (AppLayout, Sidebar, TopBar, AIPanel)"
```

---

## Task 4: AI Context 和 Hook

**Files:**
- Create: `client/src/contexts/AIContext.tsx`
- Create: `client/src/hooks/useAI.ts`
- Create: `client/src/hooks/useConfig.ts`

- [ ] **Step 1: 创建 AI Context**

```tsx
// client/src/contexts/AIContext.tsx
import React, { createContext, useContext, useState, useCallback } from "react";

interface AIResult {
  type: "success" | "error";
  content: string;
  timestamp: number;
}

interface AIContextType {
  loading: boolean;
  result: AIResult | null;
  execute: (action: string, params?: Record<string, unknown>) => Promise<void>;
  clearResult: () => void;
}

const AIContext = createContext<AIContextType | null>(null);

export const useAIContext = () => {
  const ctx = useContext(AIContext);
  if (!ctx) throw new Error("useAIContext must be used within AIProvider");
  return ctx;
};

export const AIProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AIResult | null>(null);

  const execute = useCallback(async (action: string, params?: Record<string, unknown>) => {
    setLoading(true);
    setResult(null);
    try {
      // 实际调用会在 useAI hook 中实现
      // 这里只管理状态
      console.log("AI execute:", action, params);
    } catch (error) {
      setResult({
        type: "error",
        content: error instanceof Error ? error.message : "操作失败",
        timestamp: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => setResult(null), []);

  return (
    <AIContext.Provider value={{ loading, result, execute, clearResult }}>
      {children}
    </AIContext.Provider>
  );
};
```

- [ ] **Step 2: 创建 useAI hook**

```tsx
// client/src/hooks/useAI.ts
import { useCallback } from "react";
import { api } from "../lib/api";

interface UseAIOptions {
  novelId?: string;
  chapterId?: string;
  onSuccess?: (content: string) => void;
  onError?: (error: string) => void;
}

export const useAI = (options: UseAIOptions = {}) => {
  const { novelId, chapterId, onSuccess, onError } = options;

  const generateContent = useCallback(
    async (prompt: string) => {
      try {
        const response = await api.post<{ content: string }>("/api/ai/chapter-content", {
          novelId,
          chapterId,
          prompt,
        });
        onSuccess?.(response.content);
        return response.content;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "生成失败";
        onError?.(msg);
        throw error;
      }
    },
    [novelId, chapterId, onSuccess, onError]
  );

  const checkConsistency = useCallback(
    async () => {
      if (!chapterId) return;
      try {
        const response = await api.post<{ issues: unknown[] }>("/api/ai/consistency-check", {
          novelId,
          chapterId,
        });
        return response;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "检查失败";
        onError?.(msg);
        throw error;
      }
    },
    [novelId, chapterId, onError]
  );

  const streamContent = useCallback(
    async (prompt: string, onChunk: (chunk: string) => void) => {
      try {
        const response = await fetch("/api/ai/chapter-content/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ novelId, chapterId, prompt }),
        });

        if (!response.ok) throw new Error("流式请求失败");

        const reader = response.body?.getReader();
        if (!reader) throw new Error("无法读取流");

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          onChunk(chunk);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : "流式生成失败";
        onError?.(msg);
        throw error;
      }
    },
    [novelId, chapterId, onError]
  );

  return { generateContent, checkConsistency, streamContent };
};
```

- [ ] **Step 3: 创建 useConfig hook**

```tsx
// client/src/hooks/useConfig.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";

interface AIConfig {
  id: string;
  provider: string;
  model: string;
  baseUrl?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface CreateConfigInput {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
  isDefault?: boolean;
}

export const useAIConfigs = () => {
  return useQuery({
    queryKey: ["ai-configs"],
    queryFn: () => api.get<AIConfig[]>("/api/ai-config"),
  });
};

export const useDefaultConfig = () => {
  return useQuery({
    queryKey: ["ai-config-default"],
    queryFn: () => api.get<AIConfig>("/api/ai-config/default"),
    retry: false,
  });
};

export const useCreateConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateConfigInput) => api.post<AIConfig>("/api/ai-config", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      queryClient.invalidateQueries({ queryKey: ["ai-config-default"] });
    },
  });
};

export const useDeleteConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/ai-config/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configs"] });
      queryClient.invalidateQueries({ queryKey: ["ai-config-default"] });
    },
  });
};

export const useTestConfig = () => {
  return useMutation({
    mutationFn: (id: string) => api.post<{ success: boolean; message: string }>(`/api/ai-config/${id}/test`),
  });
};
```

- [ ] **Step 4: 在 main.tsx 中包裹 AIProvider**

修改 `client/src/main.tsx`，添加 AIProvider 包裹：

```tsx
// client/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import AppRouter from "./router";
import { AIProvider } from "./contexts/AIContext";
import { Toaster } from "./components/ui/toast";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AIProvider>
        <BrowserRouter>
          <AppRouter />
          <Toaster />
        </BrowserRouter>
      </AIProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 5: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add client/src/contexts/ client/src/hooks/ client/src/main.tsx
git commit -m "feat: add AI context, useAI and useConfig hooks"
```

---

## Task 5: 书架首页重构

**Files:**
- Modify: `client/src/pages/BookShelf.tsx`
- Create: `client/src/styles/pages/bookshelf.css`

- [ ] **Step 1: 创建 bookshelf.css**

```css
/* client/src/styles/pages/bookshelf.css */
.bookshelf {
  padding: var(--space-6);
  max-width: 960px;
  margin: 0 auto;
}

.bookshelf-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.bookshelf-header h1 {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.bookshelf-banner {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(135deg, var(--accent-muted), rgba(251, 146, 60, 0.05));
  border: 1px solid rgba(249, 115, 22, 0.25);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-4);
}

.bookshelf-banner-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bookshelf-banner-text {
  flex: 1;
}

.bookshelf-banner-title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--accent-hover);
  margin-bottom: 2px;
}

.bookshelf-banner-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.bookshelf-list {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.bookshelf-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.bookshelf-item:last-child {
  border-bottom: none;
}

.bookshelf-item:hover {
  background: var(--bg-overlay);
}

.bookshelf-item-cover {
  width: 36px;
  height: 48px;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, var(--accent-muted), rgba(251, 146, 60, 0.1));
  border: 1px solid rgba(249, 115, 22, 0.2);
  flex-shrink: 0;
  overflow: hidden;
}

.bookshelf-item-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bookshelf-item-info {
  flex: 1;
  min-width: 0;
}

.bookshelf-item-title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookshelf-item-summary {
  font-size: var(--text-xs);
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookshelf-item-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-shrink: 0;
}

.bookshelf-item-status {
  font-size: var(--text-xs);
  font-weight: 500;
}

.bookshelf-item-progress {
  width: 60px;
  height: 3px;
  background: var(--border-subtle);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.bookshelf-item-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-hover));
  border-radius: var(--radius-full);
  transition: width var(--transition-slow);
}
```

- [ ] **Step 2: 重构 BookShelf.tsx**

完全替换 `client/src/pages/BookShelf.tsx`，从古风书架改为深色列表视图：

```tsx
// client/src/pages/BookShelf.tsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useDefaultConfig } from "../hooks/useConfig";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Skeleton } from "../components/ui/Skeleton";

interface NovelListItem {
  id: string;
  title: string;
  genre: string | null;
  coverImage: string | null;
  status: string;
  chapters: { id: string; wordCount: number }[];
  updatedAt: string;
}

const BookShelf: React.FC = () => {
  const navigate = useNavigate();
  const [novels, setNovels] = useState<NovelListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const { data: defaultConfig } = useDefaultConfig();

  useEffect(() => {
    loadNovels();
  }, []);

  const loadNovels = async () => {
    try {
      setLoading(true);
      const data = await api.get<NovelListItem[]>("/api/novels");
      setNovels(data || []);
    } catch (error) {
      console.error("加载作品列表失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api/novels/${id}`);
      setNovels(novels.filter((n) => n.id !== id));
      setDeleteConfirm(null);
    } catch (error) {
      console.error("删除失败:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      drafting: { label: "进行中", cls: "badge-success" },
      completed: { label: "已完成", cls: "badge-warning" },
      paused: { label: "已暂停", cls: "badge-info" },
    };
    const s = map[status] || { label: status, cls: "" };
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  if (loading) {
    return (
      <div className="bookshelf">
        <div className="bookshelf-header">
          <Skeleton width="120px" height="24px" />
          <Skeleton width="100px" height="36px" />
        </div>
        <Skeleton count={3} height="64px" />
      </div>
    );
  }

  return (
    <div className="bookshelf">
      {/* API Key 配置横幅 */}
      {!defaultConfig && (
        <div className="bookshelf-banner">
          <div className="bookshelf-banner-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div className="bookshelf-banner-text">
            <div className="bookshelf-banner-title">配置 AI 模型开始创作</div>
            <div className="bookshelf-banner-desc">添加你的 API Key，即可开始使用 AI 辅助创作</div>
          </div>
          <Button variant="primary" size="sm" onClick={() => navigate("/settings")}>
            立即配置
          </Button>
        </div>
      )}

      {/* 页面标题 */}
      <div className="bookshelf-header">
        <h1>我的作品</h1>
        <Button variant="primary" onClick={() => navigate("/create")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          新建作品
        </Button>
      </div>

      {/* 作品列表 */}
      {novels.length === 0 ? (
        <div className="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-disabled)" strokeWidth="1.5">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <p>还没有作品，点击「新建作品」开始创作</p>
        </div>
      ) : (
        <div className="bookshelf-list">
          {novels.map((novel) => {
            const totalWords = novel.chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
            const chapterCount = novel.chapters.length;
            return (
              <div
                key={novel.id}
                className="bookshelf-item"
                onClick={() => navigate(`/novel/${novel.id}`)}
              >
                <div className="bookshelf-item-cover">
                  {novel.coverImage ? (
                    <img src={novel.coverImage} alt={novel.title} />
                  ) : (
                    <div style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "var(--text-xs)",
                      color: "var(--text-muted)",
                    }}>
                      {novel.title[0]}
                    </div>
                  )}
                </div>
                <div className="bookshelf-item-info">
                  <div className="bookshelf-item-title">{novel.title}</div>
                  <div className="bookshelf-item-summary">
                    {novel.genre || "未分类"} · {chapterCount} 章 · {totalWords.toLocaleString()} 字 · {getTimeAgo(novel.updatedAt)}
                  </div>
                </div>
                <div className="bookshelf-item-meta">
                  {getStatusBadge(novel.status)}
                  <div className="bookshelf-item-progress">
                    <div
                      className="bookshelf-item-progress-bar"
                      style={{ width: `${Math.min(100, (chapterCount / 10) * 100)}%` }}
                    />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm({ id: novel.id, title: novel.title });
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      padding: "var(--space-1)",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 删除确认弹窗 */}
      <Modal open={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="确认删除">
        <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-4)" }}>
          确定要删除《{deleteConfirm?.title}》吗？此操作不可撤销。
        </p>
        <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>取消</Button>
          <Button variant="primary" onClick={() => deleteConfirm && handleDelete(deleteConfirm.id)}>确认删除</Button>
        </div>
      </Modal>
    </div>
  );
};

export default BookShelf;
```

- [ ] **Step 3: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add client/src/pages/BookShelf.tsx client/src/styles/pages/
git commit -m "feat: refactor BookShelf to dark tech list view"
```

---

## Task 6: 小说工作台重构

**Files:**
- Modify: `client/src/pages/NovelWorkspace.tsx`
- Create: `client/src/styles/pages/workspace.css`

- [ ] **Step 1: 创建 workspace.css**

```css
/* client/src/styles/pages/workspace.css */
.workspace {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.workspace-chapters {
  width: 200px;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  padding: var(--space-3);
  overflow-y: auto;
  flex-shrink: 0;
}

.workspace-chapters-title {
  font-size: var(--text-xs);
  color: var(--accent);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-2);
}

.workspace-chapter-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: 2px;
}

.workspace-chapter-item:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.workspace-chapter-item.active {
  background: var(--accent-muted);
  color: var(--accent);
}

.workspace-editor {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workspace-editor-content {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
  max-width: 720px;
  margin: 0 auto;
  width: 100%;
}
```

- [ ] **Step 2: 重构 NovelWorkspace.tsx**

三栏布局：左栏章节目录 + 中栏编辑器（含 tab） + 右栏 AI 面板。使用 AIPanel 组件，传入上下文感知的操作列表。

修改 `client/src/pages/NovelWorkspace.tsx`，主要变更：

1. **移除古风背景**：删除 `backgroundImage` SVG 纹理和 `var(--bg-primary)` 引用
2. **使用 CSS 类名**：将内联 style 替换为 `workspace.css` 中的类名
3. **添加 AI 面板**：在右侧添加 AIPanel 组件
4. **更新配色**：将 `rgba(139,69,19,...)` 等古风色替换为 `var(--accent-muted)` 等 token

主组件结构变更（关键代码）：

```tsx
// NovelWorkspace.tsx — 主要结构变更
import { AIPanel } from "../components/layout/AIPanel";
import { Tabs } from "../components/ui/Tabs";

// 在 renderContent 之前定义 AI 操作
const getAIActions = () => {
  const actions = {
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

// 主布局改为三栏
return (
  <div className="workspace">
    {/* 左栏：章节目录 */}
    <aside className="workspace-chapters">
      <div className="workspace-chapters-title">章节目录</div>
      {novel.chapters?.map((chapter: any) => (
        <div
          key={chapter.id}
          className={`workspace-chapter-item ${activeTab === "write" ? "active" : ""}`}
          onClick={() => handleTabChange("write")}
        >
          <span>{chapter.title}</span>
        </div>
      ))}
    </aside>

    {/* 中栏：编辑器 */}
    <div className="workspace-editor">
      <Tabs
        tabs={tabGroups.flatMap((g) =>
          g.tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))
        )}
        activeKey={activeTab}
        onChange={(key) => handleTabChange(key as WorkspaceTab)}
      />
      <div className="workspace-editor-content">
        {renderContent()}
      </div>
    </div>

    {/* 右栏：AI 面板 */}
    <AIPanel
      context={tabGroups.flatMap((g) => g.tabs).find((t) => t.key === activeTab)?.label || ""}
      actions={getAIActions()}
      onAction={(key) => console.log("AI action:", key)}
    />
  </div>
);
```

对于子组件（MainlinePanel、HookPanel、WorkflowDashboard、WritePanel、AnalysisPanel），执行以下模式替换：
- `background: "var(--bg-card)"` → `background: "var(--bg-surface)"`
- `background: "var(--bg-primary)"` → `background: "var(--bg-base)"`
- `border: "1px solid var(--border)"` → `border: "1px solid var(--border-default)"`
- `color: "var(--accent)"` → 保持不变（token 名称兼容）
- `borderRadius: "var(--radius-sm/md/lg)"` → 保持不变
- 删除所有 `backgroundImage` SVG 纹理
- 将 `rgba(139,69,19,...)` 替换为 `var(--accent-muted)`

- [ ] **Step 3: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add client/src/pages/NovelWorkspace.tsx client/src/styles/pages/workspace.css
git commit -m "feat: refactor NovelWorkspace to three-column layout with AI panel"
```

---

## Task 7: Pipeline 页面重构

**Files:**
- Modify: `client/src/pages/PipelinePage.tsx`
- Create: `client/src/styles/pages/pipeline.css`

- [ ] **Step 1: 创建 pipeline.css**

```css
/* client/src/styles/pages/pipeline.css */
.pipeline {
  padding: var(--space-6);
  max-width: 960px;
  margin: 0 auto;
}

.pipeline-stages {
  display: flex;
  gap: var(--space-2);
  margin-bottom: var(--space-6);
}

.pipeline-stage {
  flex: 1;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-3);
  position: relative;
}

.pipeline-stage.completed {
  background: var(--success-muted);
  border-color: rgba(34, 197, 94, 0.3);
}

.pipeline-stage.active {
  background: var(--accent-muted);
  border-color: rgba(249, 115, 22, 0.3);
}

.pipeline-stage-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}

.pipeline-stage-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-disabled);
}

.pipeline-stage.active .pipeline-stage-dot {
  background: var(--accent);
  animation: pulse 2s infinite;
}

.pipeline-stage.completed .pipeline-stage-dot {
  background: var(--success);
}

.pipeline-stage-name {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-muted);
}

.pipeline-stage.active .pipeline-stage-name {
  color: var(--accent-hover);
}

.pipeline-stage.completed .pipeline-stage-name {
  color: var(--success);
}

.pipeline-stage-status {
  font-size: var(--text-xs);
  color: var(--text-disabled);
}

.pipeline-connector {
  display: flex;
  align-items: center;
  color: var(--text-disabled);
  font-size: var(--text-xs);
  flex-shrink: 0;
}

.pipeline-chapters {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.pipeline-chapter {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--border-subtle);
}

.pipeline-chapter:last-child {
  border-bottom: none;
}

.pipeline-chapter-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-disabled);
  flex-shrink: 0;
}

.pipeline-chapter.completed .pipeline-chapter-dot {
  background: var(--success);
}

.pipeline-chapter.active .pipeline-chapter-dot {
  background: var(--accent);
  animation: pulse 2s infinite;
}

.pipeline-chapter-title {
  flex: 1;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.pipeline-chapter.active .pipeline-chapter-title {
  color: var(--text-primary);
}

.pipeline-chapter-status {
  font-size: var(--text-xs);
  color: var(--text-disabled);
}

.pipeline-chapter.completed .pipeline-chapter-status {
  color: var(--success);
}

.pipeline-chapter.active .pipeline-chapter-status {
  color: var(--accent-hover);
}
```

- [ ] **Step 2: 重构 PipelinePage.tsx**

重构 `client/src/pages/PipelinePage.tsx`，从古风卡片布局改为横向阶段流 + 章节列表。使用 `pipeline.css` 中的类名。

关键结构变更：

```tsx
// PipelinePage.tsx — 主要返回结构变更
return (
  <div className="pipeline">
    {/* 页面头部 */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
        <button
          onClick={() => navigate(`/novel/${id}`)}
          className="btn btn-ghost btn-sm"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
          返回工作台
        </button>
        <h1 style={{ fontSize: "var(--text-xl)", fontWeight: 600, color: "var(--text-primary)" }}>
          创作流程
        </h1>
      </div>
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        {pipeline.status === "running" && (
          <Button variant="secondary" size="sm" onClick={handlePause}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            暂停
          </Button>
        )}
        {pipeline.status === "paused" && (
          <Button variant="primary" size="sm" onClick={handleResume}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            恢复
          </Button>
        )}
      </div>
    </div>

    {/* 整体进度条 */}
    <div style={{
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-4)",
      marginBottom: "var(--space-6)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>整体进度</span>
        <span style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "var(--accent)" }}>{getOverallProgress()}%</span>
      </div>
      <div style={{ height: 6, background: "var(--border-subtle)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
        <div style={{ width: `${getOverallProgress()}%`, height: "100%", background: "linear-gradient(90deg, var(--accent), var(--accent-hover))", borderRadius: "var(--radius-full)", transition: "width var(--transition-slow)" }} />
      </div>
    </div>

    {/* 横向阶段流 */}
    <div className="pipeline-stages">
      {pipeline.stages.map((stage, index) => (
        <React.Fragment key={stage.id}>
          {index > 0 && <div className="pipeline-connector">→</div>}
          <div className={`pipeline-stage ${stage.status === "completed" ? "completed" : stage.status === "in_progress" ? "active" : ""}`}>
            <div className="pipeline-stage-header">
              <div className="pipeline-stage-dot" />
              <span className="pipeline-stage-name">{stage.name}</span>
            </div>
            <div className="pipeline-stage-status">
              {stage.status === "completed" ? "已完成" : stage.status === "in_progress" ? `${stage.progress}%` : "等待中"}
            </div>
          </div>
        </React.Fragment>
      ))}
    </div>

    {/* 章节列表 */}
    <div className="pipeline-chapters">
      {pipeline.stages.flatMap((stage) =>
        stage.steps.map((step) => ({
          ...step,
          stageName: stage.name,
          stageStatus: stage.status,
        }))
      ).map((step) => (
        <div key={`${step.id}-${step.stageName}`} className={`pipeline-chapter ${step.status === "completed" ? "completed" : step.status === "in_progress" ? "active" : ""}`}>
          <div className="pipeline-chapter-dot" />
          <span className="pipeline-chapter-title">{step.name}</span>
          <span className="pipeline-chapter-status">
            {step.status === "completed" ? "✓ 已完成" : step.status === "in_progress" ? "生成中..." : "等待中"}
          </span>
        </div>
      ))}
    </div>

    {/* 阶段操作按钮 */}
    {pipeline.stages.filter((s) => s.status === "completed").map((stage) => (
      <div key={stage.id} style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)" }}>
        <Button variant="primary" size="sm" onClick={() => handleConfirm(stage.id)}>确认 {stage.name}</Button>
        <Button variant="secondary" size="sm" onClick={() => handleRegenerate(stage.id)}>重新生成</Button>
      </div>
    ))}
  </div>
);
```

删除原有的古风内联样式，使用 `pipeline.css` 类名。

- [ ] **Step 3: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add client/src/pages/PipelinePage.tsx client/src/styles/pages/pipeline.css
git commit -m "feat: refactor PipelinePage to stage flow visualization"
```

---

## Task 8: 设置页面 + API Key 配置弹窗

**Files:**
- Create: `client/src/pages/Settings.tsx`
- Create: `client/src/styles/pages/settings.css`
- Modify: `client/src/router/index.tsx`

- [ ] **Step 1: 创建 settings.css**

```css
/* client/src/styles/pages/settings.css */
.settings {
  padding: var(--space-6);
  max-width: 720px;
  margin: 0 auto;
}

.settings-header {
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-6);
}

.settings-section {
  margin-bottom: var(--space-6);
}

.settings-section-title {
  font-size: var(--text-xs);
  color: var(--text-disabled);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: var(--space-3);
}

.config-card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  margin-bottom: var(--space-3);
}

.config-card.active {
  border-color: rgba(249, 115, 22, 0.3);
  background: var(--accent-muted);
}

.config-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}

.config-card-provider {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.config-card-badge {
  font-size: var(--text-xs);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
}

.config-card-details {
  display: flex;
  gap: var(--space-3);
}

.config-card-field {
  flex: 1;
  background: var(--bg-base);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
}

.config-card-field-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: 2px;
}

.config-card-field-value {
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.config-add {
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  text-align: center;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.config-add:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-muted);
}
```

- [ ] **Step 2: 创建 Settings 页面**

```tsx
// client/src/pages/Settings.tsx
import React, { useState } from "react";
import { useAIConfigs, useDefaultConfig, useCreateConfig, useDeleteConfig, useTestConfig } from "../hooks/useConfig";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";

const PROVIDERS = [
  { value: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-reasoner"] },
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"] },
  { value: "anthropic", label: "Anthropic", models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"] },
  { value: "qwen", label: "Qwen", models: ["qwen-plus", "qwen-turbo"] },
  { value: "glm", label: "GLM", models: ["glm-4", "glm-4-flash"] },
  { value: "kimi", label: "Kimi", models: ["moonshot-v1-8k", "moonshot-v1-32k"] },
  { value: "gemini", label: "Gemini", models: ["gemini-2.0-flash", "gemini-1.5-pro"] },
  { value: "mimo", label: "Mimo", models: ["mimo-v2.5-pro", "mimo-v2.5-flash"] },
];

const Settings: React.FC = () => {
  const { data: configs, isLoading } = useAIConfigs();
  const { data: defaultConfig } = useDefaultConfig();
  const createConfig = useCreateConfig();
  const deleteConfig = useDeleteConfig();
  const testConfig = useTestConfig();

  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("deepseek-chat");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const selectedProvider = PROVIDERS.find((p) => p.value === provider);

  const handleSubmit = async () => {
    if (!apiKey.trim()) return;
    try {
      await createConfig.mutateAsync({
        provider,
        model,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        isDefault: !configs || configs.length === 0,
      });
      setShowForm(false);
      setApiKey("");
      setBaseUrl("");
    } catch (error) {
      console.error("创建配置失败:", error);
    }
  };

  const handleTest = async (id: string) => {
    setTestResult(null);
    try {
      const result = await testConfig.mutateAsync(id);
      setTestResult(result);
    } catch (error) {
      setTestResult({ success: false, message: "测试失败" });
    }
  };

  return (
    <div className="settings">
      <h1 className="settings-header">AI 模型配置</h1>

      {/* 已有配置列表 */}
      <div className="settings-section">
        <div className="settings-section-title">已配置的模型</div>
        {isLoading ? (
          <div style={{ color: "var(--text-muted)", padding: "var(--space-4)" }}>加载中...</div>
        ) : configs && configs.length > 0 ? (
          configs.map((config) => (
            <div key={config.id} className={`config-card ${config.isDefault ? "active" : ""}`}>
              <div className="config-card-header">
                <span className="config-card-provider">{config.provider.toUpperCase()}</span>
                {config.isDefault && (
                  <span className="config-card-badge" style={{ background: "var(--success-muted)", color: "var(--success)" }}>
                    默认
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <Button size="sm" variant="ghost" onClick={() => handleTest(config.id)}>
                  测试连接
                </Button>
                <Button size="sm" variant="ghost" onClick={() => deleteConfig.mutate(config.id)}>
                  删除
                </Button>
              </div>
              <div className="config-card-details">
                <div className="config-card-field">
                  <div className="config-card-field-label">模型</div>
                  <div className="config-card-field-value">{config.model}</div>
                </div>
                <div className="config-card-field">
                  <div className="config-card-field-label">API Key</div>
                  <div className="config-card-field-value" style={{ color: "var(--text-disabled)" }}>sk-••••••</div>
                </div>
                {config.baseUrl && (
                  <div className="config-card-field">
                    <div className="config-card-field-label">Base URL</div>
                    <div className="config-card-field-value">{config.baseUrl}</div>
                  </div>
                )}
              </div>
            </div>
          ))
        ) : (
          <div style={{ color: "var(--text-muted)", padding: "var(--space-4)", textAlign: "center" }}>
            还没有配置任何 AI 模型
          </div>
        )}

        {/* 测试结果 */}
        {testResult && (
          <div style={{
            padding: "var(--space-3)",
            borderRadius: "var(--radius-md)",
            background: testResult.success ? "var(--success-muted)" : "var(--error-muted)",
            color: testResult.success ? "var(--success)" : "var(--error)",
            fontSize: "var(--text-sm)",
            marginTop: "var(--space-2)",
          }}>
            {testResult.message}
          </div>
        )}

        {/* 添加按钮 */}
        <div className="config-add" onClick={() => setShowForm(true)}>
          + 添加更多提供商
        </div>
      </div>

      {/* 添加配置弹窗 */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="添加 AI 模型配置" width="480px">
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)", display: "block" }}>
              AI 提供商
            </label>
            <select
              className="input"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                const p = PROVIDERS.find((p) => p.value === e.target.value);
                if (p) setModel(p.models[0]);
              }}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)", display: "block" }}>
              模型
            </label>
            <select
              className="input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {selectedProvider?.models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <Input
            label="API Key"
            type="password"
            placeholder="sk-..."
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />

          <Input
            label="Base URL（可选）"
            placeholder="https://api.example.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />

          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>取消</Button>
            <Button variant="primary" onClick={handleSubmit} loading={createConfig.isPending} disabled={!apiKey.trim()}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
```

- [ ] **Step 3: 添加路由**

修改 `client/src/router/index.tsx`，添加 Settings 页面路由：

```tsx
// client/src/router/index.tsx
import type { RouteObject } from "react-router-dom";
import { useRoutes } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import BookShelf from "@/pages/BookShelf";
import CreateWork from "@/pages/CreateWork";
import NovelForm from "@/pages/NovelForm";
import NovelWorkspace from "@/pages/NovelWorkspace";
import PipelinePage from "@/pages/PipelinePage";
import GeneralKnowledge from "@/pages/GeneralKnowledge";
import AnalyzeCreate from "@/pages/AnalyzeCreate";
import Settings from "@/pages/Settings";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <BookShelf /> },
      { path: "create", element: <CreateWork /> },
      { path: "create/new", element: <NovelForm /> },
      { path: "create/analyze", element: <AnalyzeCreate /> },
      { path: "novel/:id", element: <NovelWorkspace /> },
      { path: "novel/:id/:tab", element: <NovelWorkspace /> },
      { path: "novel/:id/pipeline", element: <PipelinePage /> },
      { path: "knowledge", element: <GeneralKnowledge /> },
      { path: "settings", element: <Settings /> },
    ],
  },
];

export default function AppRouter() {
  return useRoutes(routes);
}
```

- [ ] **Step 4: 运行类型检查**

```bash
pnpm typecheck:client
```

Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add client/src/pages/Settings.tsx client/src/styles/pages/settings.css client/src/router/
git commit -m "feat: add Settings page with AI model configuration"
```

---

## Task 9: 全局样式集成 + 古风残留清理

**Files:**
- Modify: `client/src/main.tsx`
- Delete: 旧样式文件引用

- [ ] **Step 1: 更新 main.tsx 样式导入**

```tsx
// client/src/main.tsx
// 删除旧的样式导入
// 添加新的样式导入：
// import "./styles/tokens.css";
// import "./styles/base.css";
// import "./styles/components.css";
// import "./styles/pages/bookshelf.css";
// import "./styles/pages/workspace.css";
// import "./styles/pages/pipeline.css";
// import "./styles/pages/settings.css";
```

- [ ] **Step 2: 搜索并清理内联 style**

使用 grep 搜索 `style={{` 找到所有内联样式，将通用样式迁移到 CSS 类。保留仅用于动态计算的内联 style。

- [ ] **Step 3: 运行完整构建**

```bash
pnpm build
```

Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add client/src/main.tsx
git commit -m "feat: integrate new design system and clean up legacy styles"
```

---

## Task 10: 最终验证

- [ ] **Step 1: 类型检查**

```bash
pnpm typecheck
```

Expected: PASS（shared + server + client）

- [ ] **Step 2: 完整构建**

```bash
pnpm build
```

Expected: PASS

- [ ] **Step 3: 启动验证**

```bash
pnpm dev
```

验证：
- 书架页面：列表视图，配置横幅显示
- 创建页面：表单正常
- 工作台：三栏布局，AI 面板显示
- Pipeline：阶段流可视化
- 设置页面：配置列表和表单
- 侧边栏：导航正常，可折叠
- 深色主题：全局统一，无古风残留

- [ ] **Step 4: 提交变更记录**

```bash
git add docs/change-logs/
git commit -m "docs: add UI redesign change log"
```

---

## 执行说明

本计划共 10 个 Task，可按以下方式并行：

**并行组 1（基础设施）：**
- Task 1: Design Token
- Task 2: UI 组件库
- Task 4: AI Context/Hook

**并行组 2（布局 + 页面）：**
- Task 3: 布局组件（依赖 Task 1, 2）
- Task 5: 书架重构（依赖 Task 1, 2）
- Task 7: Pipeline 重构（依赖 Task 1, 2）

**并行组 3（核心页面）：**
- Task 6: 工作台重构（依赖 Task 2, 3, 4）
- Task 8: 设置页面（依赖 Task 2, 4）

**收尾：**
- Task 9: 全局集成（依赖所有页面）
- Task 10: 最终验证

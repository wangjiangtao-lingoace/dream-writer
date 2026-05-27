import React, { useState } from "react";

// BlueprintViewer 组件：结构化展示创作蓝图
const BlueprintViewer: React.FC<{ blueprint: any }> = ({ blueprint }) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  if (!blueprint || typeof blueprint !== "object") {
    return (
      <div style={{ padding: "1rem", color: "var(--text-muted)", textAlign: "center" }}>
        暂无蓝图数据
      </div>
    );
  }

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedKeys);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedKeys(newExpanded);
  };

  const renderValue = (key: string, value: any, depth: number = 0) => {
    if (value === null || value === undefined) {
      return <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>未设置</span>;
    }

    if (typeof value === "boolean") {
      return <span style={{ color: value ? "#28a745" : "#dc3545" }}>{value ? "是" : "否"}</span>;
    }

    if (typeof value === "number") {
      return <span style={{ color: "var(--accent)" }}>{value}</span>;
    }

    if (typeof value === "string") {
      const isLong = value.length > 100;
      const isExpanded = expandedKeys.has(key);

      if (isLong) {
        return (
          <div>
            <p style={{
              margin: 0,
              color: "var(--text-primary)",
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}>
              {isExpanded ? value : value.substring(0, 100) + "..."}
            </p>
            <button
              onClick={() => toggleExpand(key)}
              style={{
                marginTop: "0.5rem",
                padding: "0.25rem 0.5rem",
                background: "transparent",
                color: "var(--accent)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-sm)",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {isExpanded ? "收起" : "展开全部"}
            </button>
          </div>
        );
      }

      return <span style={{ color: "var(--text-primary)", lineHeight: 1.7 }}>{value}</span>;
    }

    if (Array.isArray(value)) {
      return (
        <ul style={{ margin: 0, paddingLeft: "1.25rem", color: "var(--text-secondary)" }}>
          {value.map((item, index) => (
            <li key={index} style={{ marginBottom: "0.25rem", lineHeight: 1.6 }}>
              {typeof item === "object" ? JSON.stringify(item) : String(item)}
            </li>
          ))}
        </ul>
      );
    }

    if (typeof value === "object") {
      return (
        <div style={{ paddingLeft: depth > 0 ? "1rem" : 0, borderLeft: depth > 0 ? "2px solid var(--border-default)" : "none" }}>
          {Object.entries(value).map(([subKey, subValue]) => (
            <div key={subKey} style={{ marginBottom: "0.75rem" }}>
              <div style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "0.25rem",
                textTransform: "uppercase",
                letterSpacing: "0.02em",
              }}>
                {subKey}
              </div>
              <div style={{ paddingLeft: "0.5rem" }}>
                {renderValue(`${key}.${subKey}`, subValue, depth + 1)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return <span>{String(value)}</span>;
  };

  // 中文标签映射
  const labelMap: Record<string, string> = {
    title: "标题",
    genre: "类型",
    theme: "主题",
    setting: "背景设定",
    tone: "基调",
    style: "风格",
    conflict: "核心冲突",
    protagonist: "主角设定",
    antagonist: "反派设定",
    plot: "情节大纲",
    chapters: "章节规划",
    hooks: "钩子设计",
    foreshadows: "伏笔设计",
    emotions: "情感曲线",
    pacing: "节奏控制",
    wordCount: "目标字数",
    targetAudience: "目标读者",
    uniqueSellingPoint: "独特卖点",
    synopsis: "故事梗概",
    openingHook: "开篇钩子",
    climax: "高潮设计",
    resolution: "结局设计",
    themes: "主题列表",
    motifs: "母题列表",
    symbolism: "象征意义",
  };

  return (
    <div style={{ display: "grid", gap: "0.75rem" }}>
      {Object.entries(blueprint).map(([key, value]) => (
        <div key={key} style={{
          padding: "0.75rem 1rem",
          background: "var(--bg-base)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-default)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.5rem",
            paddingBottom: "0.5rem",
            borderBottom: "1px solid var(--border-light)",
          }}>
            <span style={{
              fontSize: "0.875rem",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}>
              {labelMap[key] || key}
            </span>
            {typeof value === "string" && value.length > 50 && (
              <span style={{
                fontSize: "0.6875rem",
                color: "var(--text-muted)",
                background: "var(--bg-surface)",
                padding: "0.125rem 0.375rem",
                borderRadius: "var(--radius-sm)",
              }}>
                文本
              </span>
            )}
            {Array.isArray(value) && (
              <span style={{
                fontSize: "0.6875rem",
                color: "var(--text-muted)",
                background: "var(--bg-surface)",
                padding: "0.125rem 0.375rem",
                borderRadius: "var(--radius-sm)",
              }}>
                {value.length} 项
              </span>
            )}
          </div>
          <div style={{ fontSize: "0.875rem" }}>
            {renderValue(key, value)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default BlueprintViewer;

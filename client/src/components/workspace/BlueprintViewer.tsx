import React, { useState } from "react";
import { defaultLabelMap, snakeCaseToReadable } from "../../utils/translate";

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
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {value.map((item, index) => (
            <div key={index} style={{
              padding: "0.5rem 0.75rem",
              background: "var(--bg-surface)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-light)",
              fontSize: "0.8125rem",
              lineHeight: 1.6,
            }}>
              {typeof item === "object" && item !== null ? (
                <div style={{ display: "grid", gap: "0.25rem" }}>
                  {item.title && <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.title}</div>}
                  {item.name && !item.title && <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{item.name}</div>}
                  {item.description && <div style={{ color: "var(--text-secondary)" }}>{item.description}</div>}
                  {item.role && <div style={{ color: "var(--text-muted)" }}>角色：{item.role}</div>}
                  {item.goal && <div style={{ color: "var(--text-secondary)" }}>目标：{item.goal}</div>}
                  {item.conflict && <div style={{ color: "var(--text-secondary)" }}>冲突：{item.conflict}</div>}
                  {item.motivation && <div style={{ color: "var(--text-secondary)" }}>动机：{item.motivation}</div>}
                  {/* 如果没有识别到关键字段，fallback 到前几个字段 */}
                  {!item.title && !item.name && !item.description && (
                    <div style={{ color: "var(--text-secondary)" }}>
                      {Object.entries(item).slice(0, 3).map(([k, v]) => (
                        <span key={k} style={{ marginRight: "0.75rem" }}>
                          <span style={{ color: "var(--text-muted)" }}>{(labelMap as Record<string, string>)[k] || snakeCaseToReadable(k)}：</span>
                          {typeof v === "string" ? v.slice(0, 60) : String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                String(item)
              )}
            </div>
          ))}
        </div>
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
                letterSpacing: "0.02em",
              }}>
                {labelMap[subKey] || defaultLabelMap[subKey] || snakeCaseToReadable(subKey)}
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

  // 中文标签映射（合并 defaultLabelMap）
  const labelMap: Record<string, string> = {
    ...defaultLabelMap,
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
    // 人物子字段
    name: "姓名",
    role: "角色",
    age: "年龄",
    gender: "性别",
    appearance: "外貌",
    personality: "性格",
    motivation: "动机",
    background: "背景",
    abilities: "能力",
    relationships: "关系",
    arc: "成长弧线",
    // 世界观子字段
    rules: "世界规则",
    powerSystem: "力量体系",
    geography: "地理环境",
    factions: "势力派系",
    history: "历史背景",
    culture: "文化风俗",
    magic: "魔法体系",
    technology: "科技水平",
    religion: "宗教信仰",
    economy: "经济体系",
    // 卷纲子字段
    goal: "目标",
    volumes: "卷结构",
    chapterOutlines: "章纲列表",
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

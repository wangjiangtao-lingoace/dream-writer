import React, { useState } from "react";
import { translateWorldviewKey } from "../utils/translate";

interface Worldview {
  id: string;
  novelId?: string | null;
  name: string;
  summary?: string | null;
  rules?: string | null;
  powerSystem?: string | null;
  geography?: string | null;
  factions?: string | null;
  history?: string | null;
  culture?: string | null;
  customNotes?: string | null;
}

interface WorldviewViewerProps {
  worldview: Worldview;
  onEdit?: () => void;
}

const SECTIONS = [
  { key: "summary", icon: "📝", title: "概述" },
  { key: "rules", icon: "📏", title: "世界规则" },
  { key: "powerSystem", icon: "⚡", title: "力量体系" },
  { key: "geography", icon: "🌍", title: "地理环境" },
  { key: "factions", icon: "🏛️", title: "势力派系" },
  { key: "history", icon: "📚", title: "历史背景" },
  { key: "culture", icon: "🎭", title: "文化风俗" },
  { key: "customNotes", icon: "📌", title: "自定义备注" },
];

export const WorldviewViewer: React.FC<WorldviewViewerProps> = ({
  worldview,
  onEdit,
}) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["summary"])
  );

  const toggleSection = (key: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSections(newExpanded);
  };

  const hasContent = (key: string): boolean => {
    const value = worldview[key as keyof Worldview];
    return value !== null && value !== undefined && value !== "";
  };

  const getContent = (key: string): string => {
    const value = worldview[key as keyof Worldview];
    if (value === null || value === undefined) return "";
    return String(value);
  };

  const activeSections = SECTIONS.filter((section) =>
    hasContent(section.key)
  );

  return (
    <div className="worldview-viewer">
      <div className="worldview-header">
        <h3 className="worldview-title">{worldview.name}</h3>
        {onEdit && (
          <button
            className="btn-edit"
            onClick={onEdit}
            style={{
              padding: "0.375rem 0.75rem",
              background: "transparent",
              color: "var(--accent)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8125rem",
              cursor: "pointer",
            }}
          >
            编辑
          </button>
        )}
      </div>

      {activeSections.length === 0 ? (
        <div className="worldview-empty">
          <p>暂无世界观数据，请点击编辑按钮添加。</p>
        </div>
      ) : (
        <div className="worldview-sections">
          {activeSections.map((section) => {
            const isExpanded = expandedSections.has(section.key);
            const content = getContent(section.key);

            return (
              <div
                key={section.key}
                className="worldview-section"
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-sm)",
                  marginBottom: "0.75rem",
                  overflow: "hidden",
                }}
              >
                <button
                  className="section-header"
                  onClick={() => toggleSection(section.key)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                    padding: "0.75rem 1rem",
                    background: "var(--bg-surface)",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span className="section-icon">{section.icon}</span>
                  <span
                    className="section-title"
                    style={{
                      flex: 1,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {section.title}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    style={{
                      width: "1rem",
                      height: "1rem",
                      transform: isExpanded
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      transition: "transform var(--transition-fast)",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isExpanded && (
                  <div
                    className="section-content"
                    style={{
                      padding: "1rem",
                      background: "var(--bg-base)",
                      borderTop: "1px solid var(--border-default)",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.7,
                        color: "var(--text-primary)",
                      }}
                    >
                      {content}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WorldviewViewer;
